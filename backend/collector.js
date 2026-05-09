const { poolPromise, connectWithParsedConfig, connectWithParams } = require('./db');
const cron = require('node-cron');

// Collects data for a single server
async function collectServerMetrics(server) {
    let targetPool = null;
    let centralPool = await poolPromise;
    try {
        console.log(`[Collector] Starting metrics collection for Server ID: ${server.Id}`);
        if (server.ConnectionString) {
            targetPool = await connectWithParsedConfig(server.ConnectionString);
        } else {
            targetPool = await connectWithParams(server);
        }

        // Fetch thresholds
        const thresholdResult = await centralPool.request()
            .input('serverId', server.Id)
            .query('SELECT * FROM ServerThresholds WHERE ServerId = @serverId');
        
        let thresholds = thresholdResult.recordset[0];
        if (!thresholds) {
            // Create default thresholds if missing
            await centralPool.request()
                .input('serverId', server.Id)
                .query('INSERT INTO ServerThresholds (ServerId) VALUES (@serverId)');
            thresholds = { MaxCpuPercent: 80, MaxTempDbPercent: 80, MaxBlockedProcesses: 5, MaxFailedJobs: 0, MaxDiskPercent: 80, CritDiskPercent: 90 };
        }

        // Run DMVs in parallel
        const [activeRes, tempdbRes, jobsRes, blockedRes, diskRes] = await Promise.all([
            targetPool.request().query("SELECT COUNT(*) as active_queries FROM sys.dm_exec_requests WHERE session_id > 50 AND status IN ('running', 'runnable', 'suspended')"),
            targetPool.request().query("SELECT ISNULL(SUM(unallocated_extent_page_count)*8.0/1024, 0) as free_mb, ISNULL(SUM(version_store_reserved_page_count + user_object_reserved_page_count + internal_object_reserved_page_count)*8.0/1024, 0) as used_mb FROM tempdb.sys.dm_db_file_space_usage"),
            targetPool.request().query("SELECT COUNT(*) as failed_jobs FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobservers s ON j.job_id = s.job_id WHERE s.last_run_outcome = 0 AND s.last_run_date > 0"),
            targetPool.request().query("SELECT COUNT(*) as blocked FROM sys.dm_exec_requests WHERE blocking_session_id <> 0"),
            targetPool.request().query("SELECT DISTINCT vs.volume_mount_point, CAST(CAST((vs.total_bytes - vs.available_bytes) AS FLOAT) / CAST(vs.total_bytes AS FLOAT) * 100 AS DECIMAL(18,2)) AS used_percent FROM sys.master_files AS mf CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) AS vs")
        ]);

        const activeQueries = activeRes.recordset[0].active_queries;
        const tempdbFree = tempdbRes.recordset[0].free_mb;
        const tempdbUsed = tempdbRes.recordset[0].used_mb;
        const tempdbPercent = tempdbFree + tempdbUsed > 0 ? (tempdbUsed / (tempdbFree + tempdbUsed)) * 100 : 0;
        const failedJobs = jobsRes.recordset[0].failed_jobs;
        const blocked = blockedRes.recordset[0].blocked;
        
        const diskResults = diskRes ? diskRes.recordset : [];
        const maxDiskUsed = diskResults.length > 0 ? Math.max(...diskResults.map(d => d.used_percent)) : 0;
        
        const cpuPercent = 50; 

        // Save History
        await centralPool.request()
            .input('serverId', server.Id)
            .input('cpu', cpuPercent)
            .input('active', activeQueries)
            .input('tempdb', tempdbPercent)
            .input('blocked', blocked)
            .input('jobs', failedJobs)
            .input('disk', maxDiskUsed)
            .query(`
                INSERT INTO MetricsHistory (ServerId, CpuPercent, ActiveQueries, TempDbPercent, BlockedProcesses, FailedJobs, DiskUsedPercent) 
                VALUES (@serverId, @cpu, @active, @tempdb, @blocked, @jobs, @disk)
            `);

        // Check Thresholds and Trigger Alerts
        const alerts = [];
        if (tempdbPercent > thresholds.MaxTempDbPercent) {
            alerts.push({ name: 'TempDB', value: tempdbPercent, limit: thresholds.MaxTempDbPercent, msg: `TempDB used is ${tempdbPercent.toFixed(1)}%, exceeds limit of ${thresholds.MaxTempDbPercent}%` });
        }
        if (blocked > thresholds.MaxBlockedProcesses) {
            alerts.push({ name: 'Blocking', value: blocked, limit: thresholds.MaxBlockedProcesses, msg: `${blocked} processes are blocked, exceeds limit of ${thresholds.MaxBlockedProcesses}` });
        }
        if (failedJobs > thresholds.MaxFailedJobs) {
            alerts.push({ name: 'Failed Jobs', value: failedJobs, limit: thresholds.MaxFailedJobs, msg: `${failedJobs} SQL Agent jobs failed recently.` });
        }
        
        // Disk Alerts
        for (const disk of diskResults) {
            if (disk.used_percent >= thresholds.CritDiskPercent) {
                alerts.push({ name: `Disk: ${disk.volume_mount_point}`, value: disk.used_percent, limit: thresholds.CritDiskPercent, msg: `Disk ${disk.volume_mount_point} is ${disk.used_percent}% full (Critical limit: ${thresholds.CritDiskPercent}%)` });
            } else if (disk.used_percent >= thresholds.MaxDiskPercent) {
                alerts.push({ name: `Disk: ${disk.volume_mount_point}`, value: disk.used_percent, limit: thresholds.MaxDiskPercent, msg: `Disk ${disk.volume_mount_point} is ${disk.used_percent}% full (Warning limit: ${thresholds.MaxDiskPercent}%)` });
            }
        }

        // Evaluate Custom Alerts
        const customAlertsResult = await centralPool.request()
            .input('serverId', server.Id)
            .query('SELECT * FROM CustomAlerts WHERE ServerId = @serverId AND IsActive = 1');
            
        for (const customAlert of customAlertsResult.recordset) {
            try {
                const res = await targetPool.request().query(customAlert.QueryText);
                if (res.recordset.length > 0) {
                    const val = Object.values(res.recordset[0])[0];
                    if (val !== null && val !== undefined) {
                        let isAlert = false;
                        let thresholdHit = customAlert.CriticalThreshold;
                        
                        if (customAlert.ComparisonType === '>' && val >= customAlert.CriticalThreshold) isAlert = true;
                        else if (customAlert.ComparisonType === '<' && val <= customAlert.CriticalThreshold) isAlert = true;
                        else if (customAlert.ComparisonType === '=' && val == customAlert.CriticalThreshold) isAlert = true;
                        
                        if (isAlert) {
                            alerts.push({ name: `Custom: ${customAlert.AlertName}`, value: val, limit: thresholdHit, msg: `Custom Alert '${customAlert.AlertName}' triggered. Value: ${val} ${customAlert.ComparisonType}= ${thresholdHit}` });
                        }
                    }
                }
            } catch (err) {
                console.error(`[Collector] Custom Alert '${customAlert.AlertName}' failed:`, err.message);
            }
        }

        // Save Alerts
        for (const alert of alerts) {
            await centralPool.request()
                .input('serverId', server.Id)
                .input('metric', alert.name)
                .input('val', alert.value)
                .input('lim', alert.limit)
                .input('msg', alert.msg)
                .query(`
                    INSERT INTO AlertHistory (ServerId, MetricName, MetricValue, ThresholdValue, Message)
                    VALUES (@serverId, @metric, @val, @lim, @msg)
                `);
            console.log(`[Alert] ${server.ServerName}: ${alert.msg}`);
        }

        console.log(`[Collector] Server ${server.Id} metrics collected successfully.`);
    } catch (err) {
        console.error(`[Collector] Failed for Server ${server.Id}:`, err.message);
    } finally {
        if (targetPool) {
            await targetPool.close();
        }
    }
}

// Main job runner
async function startCollector() {
    console.log('[Collector] Service initialized. Running every 1 minute...');
    
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const pool = await poolPromise;
            const serversResult = await pool.request().query('SELECT Id, ServerName, ConnectionString, AuthType, Username, Password, Encrypt, TrustCert, ConnTimeout FROM MonitoredServers WHERE IsActive = 1');
            const servers = serversResult.recordset;
            
            console.log(`[Collector] Starting cycle for ${servers.length} servers...`);
            for (const server of servers) {
                // Run sequentially to avoid overloading central DB, but could be Promise.all
                await collectServerMetrics(server);
            }
        } catch (err) {
            console.error('[Collector] Main loop error:', err.message);
        }
    });
}

module.exports = { startCollector };
