const express = require('express');
const cors = require('cors');
const { poolPromise, initializeDB, connectWithParsedConfig, connectWithParams } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3000;

initializeDB();

// --- Lookup Endpoints ---
app.get('/api/lookups/:category', async (req, res) => {
    const tableMap = {
        environments: 'Lookup_Environments',
        roles: 'Lookup_Roles',
        locations: 'Lookup_Locations',
        criticality: 'Lookup_Criticality',
        groups: 'Lookup_Groups',
        monitoring: 'Lookup_MonitoringOptions'
    };
    const table = tableMap[req.params.category.toLowerCase()];
    if (!table) return res.status(404).json({ error: 'Category not found' });

    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`SELECT * FROM ${table}`);
        res.json(result.recordset);
    } catch (err) {
        console.error(`[Lookup Error] category=${req.params.category}:`, err);
        res.status(500).json({ error: 'Failed to fetch lookups', details: err.message });
    }
});

// --- Core Server Endpoints ---

app.get('/api/servers', async (req, res) => {
    try {
        const { env, criticality, location, active } = req.query;
        const pool = await poolPromise;
        let query = 'SELECT * FROM MonitoredServers WHERE 1=1';
        const request = pool.request();

        if (env) { request.input('env', env); query += ' AND Environment = @env'; }
        if (criticality) { request.input('crit', criticality); query += ' AND Criticality = @crit'; }
        if (location) { request.input('loc', location); query += ' AND Location = @loc'; }
        if (active !== undefined) { request.input('active', active === 'true' ? 1 : 0); query += ' AND IsActive = @active'; }

        query += ' ORDER BY CASE WHEN Environment = \'PROD\' THEN 0 ELSE 1 END, CreatedAt DESC';
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch servers', details: err.message });
    }
});


app.post('/api/lookups/:category', async (req, res) => {
    const tableMap = {
        environments: 'Lookup_Environments',
        locations: 'Lookup_Locations',
        groups: 'Lookup_Groups'
    };
    const table = tableMap[req.params.category.toLowerCase()];
    if (!table) return res.status(400).json({ error: 'Category not supported for dynamic adding' });

    const { name } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request().input('name', name).query(`INSERT INTO ${table} (Name) VALUES (@name)`);
        res.status(201).json({ message: 'Added successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add' });
    }
});

app.post('/api/servers', async (req, res) => {
    const { 
        serverName, alias, environment, role, location, criticality, 
        authType, username, password, encrypt, trustCert, connTimeout, queryTimeout,
        isActive, connectionString 
    } = req.body;

    if (!serverName || !alias) return res.status(400).json({ error: 'serverName and alias are required.' });

    try {
        // Test connection
        let testPool;
        if (connectionString) {
            testPool = await connectWithParsedConfig(connectionString);
        } else {
            testPool = await connectWithParams(req.body);
        }
        await testPool.close();

        const pool = await poolPromise;
        const result = await pool.request()
            .input('name', serverName)
            .input('alias', alias)
            .input('env', environment || 'PROD')
            .input('role', role || 'Standalone')
            .input('loc', location || 'Local')
            .input('crit', criticality || 'Medium')
            .input('auth', authType || 'SQL')
            .input('user', username)
            .input('pass', password)
            .input('enc', encrypt ? 1 : 0)
            .input('trust', trustCert ? 1 : 0)
            .input('ct', connTimeout || 15)
            .input('qt', queryTimeout || 30)
            .input('active', isActive !== undefined ? (isActive ? 1 : 0) : 1)
            .input('connStr', connectionString)
            .query(`
                INSERT INTO MonitoredServers 
                (ServerName, Alias, Environment, ServerRole, Location, Criticality, AuthType, Username, Password, Encrypt, TrustCert, ConnTimeout, QueryTimeout, IsActive, ConnectionString) 
                OUTPUT inserted.*
                VALUES (@name, @alias, @env, @role, @loc, @crit, @auth, @user, @pass, @enc, @trust, @ct, @qt, @active, @connStr)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(400).json({ error: 'Failed to add server. Connection might be invalid.', details: err.message });
    }
});

app.put('/api/servers/:id', async (req, res) => {
    const { 
        serverName, alias, environment, role, location, criticality, 
        authType, username, password, encrypt, trustCert, connTimeout, queryTimeout,
        isActive, connectionString 
    } = req.body;

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id', req.params.id)
            .input('name', serverName)
            .input('alias', alias)
            .input('env', environment)
            .input('role', role)
            .input('loc', location)
            .input('crit', criticality)
            .input('auth', authType)
            .input('user', username)
            .input('pass', password)
            .input('enc', encrypt ? 1 : 0)
            .input('trust', trustCert ? 1 : 0)
            .input('ct', connTimeout)
            .input('qt', queryTimeout)
            .input('active', isActive !== undefined ? (isActive ? 1 : 0) : 1)
            .input('connStr', connectionString)
            .query(`
                UPDATE MonitoredServers SET 
                ServerName = @name, Alias = @alias, Environment = @env, ServerRole = @role, Location = @loc, Criticality = @crit,
                AuthType = @auth, Username = @user, Password = @pass, Encrypt = @enc, TrustCert = @trust, 
                ConnTimeout = @ct, QueryTimeout = @qt, IsActive = @active, ConnectionString = @connStr
                WHERE Id = @id
            `);
        res.json({ message: 'Server updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update server', details: err.message });
    }
});

app.delete('/api/servers/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().input('id', req.params.id).query('DELETE FROM MonitoredServers WHERE Id = @id');
        res.json({ message: 'Server deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete server', details: err.message });
    }
});

async function getTargetPool(serverId) {
    const pool = await poolPromise;
    const result = await pool.request().input('id', serverId).query('SELECT * FROM MonitoredServers WHERE Id = @id');
    if (result.recordset.length === 0) throw new Error('Server not found');
    
    const server = result.recordset[0];
    if (server.ConnectionString) {
        return await connectWithParsedConfig(server.ConnectionString);
    } else {
        return await connectWithParams(server);
    }
}

app.get('/api/servers/:id/status', async (req, res) => {
    try {
        const pool = await getTargetPool(req.params.id);
        const result = await pool.request().query('SELECT @@VERSION as version, GETDATE() as currentTime');
        await pool.close();
        res.json({ status: 'online', version: result.recordset[0].version, currentTime: result.recordset[0].currentTime });
    } catch (err) {
        res.status(200).json({ status: 'offline', error: err.message });
    }
});

// --- Advanced DMV Endpoints ---

// Helper to execute query safely
async function executeDMV(req, res, queryText) {
    try {
        const pool = await getTargetPool(req.params.id);
        const result = await pool.request().query(queryText);
        await pool.close();
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'DMV Query Failed', details: err.message });
    }
}

// 1. Active Queries
app.get('/api/servers/:id/dmv/active-queries', (req, res) => {
    const query = `
        SELECT TOP 20 
            r.session_id, 
            s.login_name, 
            s.host_name,
            c.client_net_address,
            r.status, 
            r.command, 
            r.wait_type,
            r.cpu_time, 
            r.total_elapsed_time,
            ib.event_info as input_buffer,
            SUBSTRING(t.text, (r.statement_start_offset/2)+1, 
            ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text) ELSE r.statement_end_offset END - r.statement_start_offset)/2) + 1) AS sql_text,
            CONVERT(NVARCHAR(MAX), qp.query_plan) as query_plan
        FROM sys.dm_exec_requests r 
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        LEFT JOIN sys.dm_exec_connections c ON r.session_id = c.session_id
        OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
        OUTER APPLY sys.dm_exec_query_plan(r.plan_handle) qp
        OUTER APPLY sys.dm_exec_input_buffer(r.session_id, r.request_id) ib
        WHERE r.session_id > 50 AND r.session_id <> @@SPID 
        ORDER BY r.cpu_time DESC
    `;
    executeDMV(req, res, query);
});

// 2. Waits
app.get('/api/servers/:id/dmv/waits', (req, res) => {
    executeDMV(req, res, `
        SELECT TOP 20 wait_type, wait_time_ms, waiting_tasks_count, signal_wait_time_ms
        FROM sys.dm_os_wait_stats
        WHERE wait_type NOT LIKE '%SLEEP%' AND wait_type NOT IN ('CLR_SEMAPHORE','LAZYWRITER_SLEEP','RESOURCE_QUEUE','SQLTRACE_BUFFER_FLUSH','WAITFOR', 'LOGMGR_QUEUE','CHECKPOINT_QUEUE','REQUEST_FOR_DEADLOCK_SEARCH','XE_TIMER_EVENT','BROKER_TO_FLUSH','BROKER_TASK_STOP','CLR_MANUAL_EVENT','CLR_AUTO_EVENT','DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT','XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN', 'SQLTRACE_INCREMENTAL_FLUSH_SLEEP','ONDEMAND_TASK_QUEUE', 'BROKER_EVENTHANDLER', 'DIRTY_PAGE_POLL', 'HADR_FILESTREAM_IOMGR_IOCOMPLETION')
        ORDER BY wait_time_ms DESC
    `);
});

// 3. CPU / Top Queries
app.get('/api/servers/:id/dmv/cpu', (req, res) => {
    executeDMV(req, res, `
        SELECT TOP 20 
            qs.execution_count,
            qs.total_worker_time/1000 AS total_cpu_ms,
            qs.total_elapsed_time/1000 AS total_elapsed_ms,
            qs.total_logical_reads,
            qs.total_logical_writes,
            qs.creation_time,
            qs.last_execution_time,
            SUBSTRING(qt.text, (qs.statement_start_offset/2)+1, ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(qt.text) ELSE qs.statement_end_offset END - qs.statement_start_offset)/2)+1) as query_text
        FROM sys.dm_exec_query_stats qs
        CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
        ORDER BY qs.total_worker_time DESC
    `);
});

// 4. IO / Disk
app.get('/api/servers/:id/dmv/io', (req, res) => {
    executeDMV(req, res, `
        SELECT 
            DB_NAME(vfs.database_id) as db_name,
            mf.name as file_logical_name,
            mf.physical_name,
            vfs.num_of_reads,
            vfs.num_of_writes,
            vfs.io_stall_read_ms,
            vfs.io_stall_write_ms,
            mf.size * 8 / 1024 as size_mb
        FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
        JOIN sys.master_files mf ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
        ORDER BY vfs.io_stall_read_ms + vfs.io_stall_write_ms DESC
    `);
});

// 4b. Disks
app.get('/api/servers/:id/dmv/disks', (req, res) => {
    executeDMV(req, res, `
        SELECT DISTINCT
            vs.volume_mount_point AS [Drive],
            vs.logical_volume_name AS [Label],
            CAST(vs.total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(18,2)) AS [Total_GB],
            CAST(vs.available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(18,2)) AS [Free_GB],
            CAST((vs.total_bytes - vs.available_bytes) / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(18,2)) AS [Used_GB],
            CAST(CAST((vs.total_bytes - vs.available_bytes) AS FLOAT) / CAST(vs.total_bytes AS FLOAT) * 100 AS DECIMAL(18,2)) AS [Used_Percent]
        FROM sys.master_files AS mf
        CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) AS vs
    `);
});

// 5. Memory
app.get('/api/servers/:id/dmv/memory', (req, res) => {
    executeDMV(req, res, `
        SELECT TOP 20 type, sum(pages_kb)/1024 as size_mb
        FROM sys.dm_os_memory_clerks
        GROUP BY type
        ORDER BY size_mb DESC
    `);
});

// 6. TempDB
app.get('/api/servers/:id/dmv/tempdb', (req, res) => {
    executeDMV(req, res, `
        SELECT 
            SUM(unallocated_extent_page_count)*8.0/1024 as free_mb, 
            SUM(version_store_reserved_page_count)*8.0/1024 as version_store_mb, 
            SUM(user_object_reserved_page_count)*8.0/1024 as user_obj_mb,
            SUM(internal_object_reserved_page_count)*8.0/1024 as internal_obj_mb
        FROM tempdb.sys.dm_db_file_space_usage
    `);
});

// 7. Logs
app.get('/api/servers/:id/dmv/logs', (req, res) => {
    executeDMV(req, res, `DBCC SQLPERF(LOGSPACE)`);
});

// 8. Indexes
app.get('/api/servers/:id/dmv/indexes', (req, res) => {
    executeDMV(req, res, `
        SELECT TOP 15 
            DB_NAME(database_id) as db_name, 
            OBJECT_NAME(object_id, database_id) as table_name, 
            avg_fragmentation_in_percent,
            page_count
        FROM sys.dm_db_index_physical_stats(NULL, NULL, NULL, NULL, 'LIMITED')
        WHERE avg_fragmentation_in_percent > 10 AND index_id > 0
        ORDER BY avg_fragmentation_in_percent DESC
    `);
});

// 9. Capacity
app.get('/api/servers/:id/dmv/capacity', (req, res) => {
    executeDMV(req, res, `
        SELECT name, state_desc, recovery_model_desc, size * 8 / 1024 as size_mb
        FROM sys.master_files
        WHERE type = 0
        ORDER BY size DESC
    `);
});

// 10. Backups
app.get('/api/servers/:id/dmv/backups', (req, res) => {
    executeDMV(req, res, `
        SELECT TOP 20 
            database_name, 
            CASE type WHEN 'D' THEN 'Full' WHEN 'I' THEN 'Diff' WHEN 'L' THEN 'Log' ELSE type END as type,
            backup_start_date,
            backup_finish_date, 
            backup_size/1024/1024 as size_mb,
            compressed_backup_size/1024/1024 as compressed_size_mb
        FROM msdb.dbo.backupset 
        ORDER BY backup_finish_date DESC
    `);
});

// 11. AlwaysOn
app.get('/api/servers/:id/dmv/alwayson', (req, res) => {
    executeDMV(req, res, `
        IF OBJECT_ID('sys.dm_hadr_availability_replica_states') IS NOT NULL
        BEGIN
            SELECT r.replica_server_name, rs.role_desc, rs.connected_state_desc, rs.synchronization_health_desc
            FROM sys.dm_hadr_availability_replica_states rs
            JOIN sys.availability_replicas r ON rs.replica_id = r.replica_id
        END
        ELSE SELECT 'AlwaysOn is not configured' as message
    `);
});

// 12. Jobs
app.get('/api/servers/:id/dmv/jobs', (req, res) => {
    executeDMV(req, res, `
        SELECT TOP 20 j.name, a.start_execution_date, a.stop_execution_date, 
        CASE WHEN a.stop_execution_date IS NULL AND a.start_execution_date IS NOT NULL THEN 'Running' ELSE 'Idle' END as status,
        j.enabled
        FROM msdb.dbo.sysjobactivity a
        JOIN msdb.dbo.sysjobs j ON a.job_id = j.job_id
        ORDER BY a.start_execution_date DESC
    `);
});

// 13. Security (Logins)
app.get('/api/servers/:id/dmv/security', (req, res) => {
    executeDMV(req, res, `
        SELECT name, type_desc, is_disabled, create_date, modify_date 
        FROM sys.server_principals 
        WHERE type IN ('S', 'U', 'G') AND name NOT LIKE '##%'
        ORDER BY create_date DESC
    `);
});

// --- KPI Summary Endpoint ---
app.get('/api/servers/:id/kpi-summary', async (req, res) => {
    try {
        const pool = await getTargetPool(req.params.id);
        
        // Execute queries in parallel to avoid tedious hanging on multiple recordsets
        const [activeRes, tempdbRes, jobsRes, blockedRes, diskRes] = await Promise.all([
            pool.request().query("SELECT COUNT(*) as active_queries FROM sys.dm_exec_requests WHERE session_id > 50 AND status IN ('running', 'runnable', 'suspended')"),
            pool.request().query("SELECT ISNULL(SUM(unallocated_extent_page_count)*8.0/1024, 0) as free_mb, ISNULL(SUM(version_store_reserved_page_count + user_object_reserved_page_count + internal_object_reserved_page_count)*8.0/1024, 0) as used_mb FROM tempdb.sys.dm_db_file_space_usage"),
            pool.request().query("SELECT COUNT(*) as failed_jobs FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobservers s ON j.job_id = s.job_id WHERE s.last_run_outcome = 0 AND s.last_run_date > 0"),
            pool.request().query("SELECT COUNT(*) as blocked FROM sys.dm_exec_requests WHERE blocking_session_id <> 0"),
            pool.request().query("SELECT DISTINCT vs.volume_mount_point, CAST(CAST((vs.total_bytes - vs.available_bytes) AS FLOAT) / CAST(vs.total_bytes AS FLOAT) * 100 AS DECIMAL(18,2)) AS used_percent FROM sys.master_files AS mf CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) AS vs")
        ]);
        
        await pool.close();
        
        const centralPool = await poolPromise;
        const customAlertsCount = await centralPool.request()
            .input('serverId', req.params.id)
            .query("SELECT COUNT(*) as cnt FROM AlertHistory WHERE ServerId = @serverId AND MetricName LIKE 'Custom:%' AND AlertTime > DATEADD(minute, -5, GETDATE())");
        
        const activeQueries = activeRes.recordset[0].active_queries;
        const tempdbFree = tempdbRes.recordset[0].free_mb;
        const tempdbUsed = tempdbRes.recordset[0].used_mb;
        const tempdbPercent = tempdbFree + tempdbUsed > 0 ? (tempdbUsed / (tempdbFree + tempdbUsed)) * 100 : 0;
        const failedJobs = jobsRes.recordset[0].failed_jobs;
        const blocked = blockedRes.recordset[0].blocked;
        const diskResults = diskRes ? diskRes.recordset : [];
        const maxDiskUsed = diskResults.length > 0 ? Math.max(...diskResults.map(d => d.used_percent)) : 0;
        const hasCustomAlerts = customAlertsCount.recordset[0].cnt > 0;

        res.json({
            activeQueries,
            tempdbPercent,
            failedJobs,
            blocked,
            maxDiskUsed,
            hasCustomAlerts
        });
    } catch (err) {
        console.error("KPI Error:", err);
        res.status(500).json({ error: 'Failed to fetch KPI summary', details: err.message });
    }
});

const { startCollector } = require('./collector');

// --- Thresholds Endpoints ---
app.get('/api/servers/:id/thresholds', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('serverId', req.params.id)
            .query('SELECT * FROM ServerThresholds WHERE ServerId = @serverId');
        
        if (result.recordset.length === 0) {
            res.json({ MaxCpuPercent: 80, MaxTempDbPercent: 80, MaxBlockedProcesses: 5, MaxFailedJobs: 0, MaxDiskPercent: 80, CritDiskPercent: 90 }); // Defaults
        } else {
            res.json(result.recordset[0]);
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch thresholds', details: err.message });
    }
});

app.post('/api/servers/:id/thresholds', async (req, res) => {
    const { MaxCpuPercent, MaxTempDbPercent, MaxBlockedProcesses, MaxFailedJobs, MaxDiskPercent, CritDiskPercent } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('serverId', req.params.id)
            .input('cpu', MaxCpuPercent)
            .input('tempdb', MaxTempDbPercent)
            .input('blocked', MaxBlockedProcesses)
            .input('jobs', MaxFailedJobs)
            .input('disk', MaxDiskPercent)
            .input('critDisk', CritDiskPercent)
            .query(`
                UPDATE ServerThresholds 
                SET MaxCpuPercent = @cpu, MaxTempDbPercent = @tempdb, MaxBlockedProcesses = @blocked, MaxFailedJobs = @jobs, 
                    MaxDiskPercent = @disk, CritDiskPercent = @critDisk, UpdatedAt = GETDATE()
                WHERE ServerId = @serverId;
                
                IF @@ROWCOUNT = 0
                INSERT INTO ServerThresholds (ServerId, MaxCpuPercent, MaxTempDbPercent, MaxBlockedProcesses, MaxFailedJobs, MaxDiskPercent, CritDiskPercent)
                VALUES (@serverId, @cpu, @tempdb, @blocked, @jobs, @disk, @critDisk);
            `);
        res.json({ message: 'Thresholds updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update thresholds', details: err.message });
    }
});

// --- Settings (Feature Toggles) Endpoint ---
app.post('/api/servers/:id/settings', async (req, res) => {
    const { DisabledFeatures } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('serverId', req.params.id)
            .input('features', DisabledFeatures || '')
            .query('UPDATE MonitoredServers SET DisabledFeatures = @features WHERE Id = @serverId');
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings', details: err.message });
    }
});

// --- Custom Alerts Endpoints ---
app.get('/api/servers/:id/custom-alerts', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('serverId', req.params.id)
            .query('SELECT * FROM CustomAlerts WHERE ServerId = @serverId ORDER BY CreatedAt DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch custom alerts', details: err.message });
    }
});

app.get('/api/servers/:id/custom-alerts/live', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('serverId', req.params.id)
            .query('SELECT * FROM CustomAlerts WHERE ServerId = @serverId AND IsActive = 1 ORDER BY CreatedAt DESC');
        
        const alerts = result.recordset;
        if(alerts.length === 0) return res.json([]);

        const targetPool = await getTargetPool(req.params.id);
        
        const liveAlerts = await Promise.all(alerts.map(async (alert) => {
            let liveValue = null;
            let status = 'up'; // default OK
            try {
                const res = await targetPool.request().query(alert.QueryText);
                if (res.recordset.length > 0) {
                    const val = Object.values(res.recordset[0])[0];
                    if (val !== null && val !== undefined) {
                        liveValue = val;
                        // evaluate status
                        if (alert.ComparisonType === '>' && val >= alert.CriticalThreshold) status = 'danger';
                        else if (alert.ComparisonType === '>' && val >= alert.WarningThreshold) status = 'warning';
                        else if (alert.ComparisonType === '<' && val <= alert.CriticalThreshold) status = 'danger';
                        else if (alert.ComparisonType === '<' && val <= alert.WarningThreshold) status = 'warning';
                        else if (alert.ComparisonType === '=' && val == alert.CriticalThreshold) status = 'danger';
                        else if (alert.ComparisonType === '=' && val == alert.WarningThreshold) status = 'warning';
                    }
                }
            } catch(e) {
                liveValue = 'Error';
                status = 'danger';
            }
            return { ...alert, liveValue, status };
        }));
        
        await targetPool.close();
        res.json(liveAlerts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch live custom alerts', details: err.message });
    }
});

app.post('/api/servers/:id/custom-alerts', async (req, res) => {
    const { AlertName, QueryText, WarningThreshold, CriticalThreshold, ComparisonType } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('serverId', req.params.id)
            .input('name', AlertName)
            .input('query', QueryText)
            .input('warn', WarningThreshold)
            .input('crit', CriticalThreshold)
            .input('comp', ComparisonType || '>')
            .query(`
                INSERT INTO CustomAlerts (ServerId, AlertName, QueryText, WarningThreshold, CriticalThreshold, ComparisonType)
                VALUES (@serverId, @name, @query, @warn, @crit, @comp)
            `);
        res.json({ message: 'Custom alert added successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add custom alert', details: err.message });
    }
});

app.delete('/api/servers/:id/custom-alerts/:alertId', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('alertId', req.params.alertId)
            .input('serverId', req.params.id)
            .query('DELETE FROM CustomAlerts WHERE Id = @alertId AND ServerId = @serverId');
        res.json({ message: 'Custom alert deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete custom alert', details: err.message });
    }
});



app.listen(PORT, () => {
    console.log(`SQL Monitor Backend running on http://localhost:${PORT}`);
    startCollector(); // Start the background collector
});
