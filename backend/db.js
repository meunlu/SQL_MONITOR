const sql = require('mssql');

const config = {
  user: 'sql_mon_admin',
  password: 'AaSs1234567.',
  server: 'localhost',
  database: 'SQL_MONITOR',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log('Connected to central SQL_MONITOR Database');
    return pool;
  })
  .catch((err) => console.log('Database Connection Failed! Bad Config: ', err));

async function initializeDB() {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    
    // 1. Lookup Tables
    const createLookupsQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Environments' AND xtype='U')
      CREATE TABLE Lookup_Environments (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE, Color NVARCHAR(20) DEFAULT '#38bdf8')
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Roles' AND xtype='U')
      CREATE TABLE Lookup_Roles (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE)
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Locations' AND xtype='U')
      CREATE TABLE Lookup_Locations (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE)
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Criticality' AND xtype='U')
      CREATE TABLE Lookup_Criticality (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE, Color NVARCHAR(20))
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Groups' AND xtype='U')
      CREATE TABLE Lookup_Groups (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE)
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_MonitoringOptions' AND xtype='U')
      CREATE TABLE Lookup_MonitoringOptions (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(100) UNIQUE, Category NVARCHAR(50))
    `;
    await request.query(createLookupsQuery);

    // 2. Main MonitoredServers table (Updated)
    const createServersTableQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MonitoredServers' AND xtype='U')
      BEGIN
          CREATE TABLE MonitoredServers (
              Id INT PRIMARY KEY IDENTITY(1,1),
              ServerName NVARCHAR(255) NOT NULL UNIQUE,
              Alias NVARCHAR(255) NOT NULL,
              ConnectionString NVARCHAR(MAX),
              Environment NVARCHAR(50) DEFAULT 'PROD',
              ServerRole NVARCHAR(50) DEFAULT 'Standalone',
              Location NVARCHAR(50) DEFAULT 'Local',
              Criticality NVARCHAR(50) DEFAULT 'Medium',
              IsActive BIT DEFAULT 1,
              AuthType NVARCHAR(20) DEFAULT 'SQL',
              Username NVARCHAR(100),
              Password NVARCHAR(255),
              Encrypt BIT DEFAULT 0,
              TrustCert BIT DEFAULT 1,
              ConnTimeout INT DEFAULT 15,
              QueryTimeout INT DEFAULT 30,
              LastCheckTime DATETIME,
              CreatedAt DATETIME DEFAULT GETDATE(),
              DisabledFeatures NVARCHAR(MAX) DEFAULT ''
          )
      END

      -- Add columns if they don't exist (Migration)
      IF COL_LENGTH('MonitoredServers', 'Alias') IS NULL ALTER TABLE MonitoredServers ADD Alias NVARCHAR(255) DEFAULT ''
      IF COL_LENGTH('MonitoredServers', 'Environment') IS NULL ALTER TABLE MonitoredServers ADD Environment NVARCHAR(50) DEFAULT 'PROD'
      IF COL_LENGTH('MonitoredServers', 'ServerRole') IS NULL ALTER TABLE MonitoredServers ADD ServerRole NVARCHAR(50) DEFAULT 'Standalone'
      IF COL_LENGTH('MonitoredServers', 'Location') IS NULL ALTER TABLE MonitoredServers ADD Location NVARCHAR(50) DEFAULT 'Local'
      IF COL_LENGTH('MonitoredServers', 'Criticality') IS NULL ALTER TABLE MonitoredServers ADD Criticality NVARCHAR(50) DEFAULT 'Medium'
      IF COL_LENGTH('MonitoredServers', 'IsActive') IS NULL ALTER TABLE MonitoredServers ADD IsActive BIT DEFAULT 1
      IF COL_LENGTH('MonitoredServers', 'AuthType') IS NULL ALTER TABLE MonitoredServers ADD AuthType NVARCHAR(20) DEFAULT 'SQL'
      IF COL_LENGTH('MonitoredServers', 'Username') IS NULL ALTER TABLE MonitoredServers ADD Username NVARCHAR(100)
      IF COL_LENGTH('MonitoredServers', 'Password') IS NULL ALTER TABLE MonitoredServers ADD Password NVARCHAR(255)
      IF COL_LENGTH('MonitoredServers', 'Encrypt') IS NULL ALTER TABLE MonitoredServers ADD Encrypt BIT DEFAULT 0
      IF COL_LENGTH('MonitoredServers', 'TrustCert') IS NULL ALTER TABLE MonitoredServers ADD TrustCert BIT DEFAULT 1
      IF COL_LENGTH('MonitoredServers', 'ConnTimeout') IS NULL ALTER TABLE MonitoredServers ADD ConnTimeout INT DEFAULT 15
      IF COL_LENGTH('MonitoredServers', 'QueryTimeout') IS NULL ALTER TABLE MonitoredServers ADD QueryTimeout INT DEFAULT 30
      IF COL_LENGTH('MonitoredServers', 'LastCheckTime') IS NULL ALTER TABLE MonitoredServers ADD LastCheckTime DATETIME
    `;
    await request.query(createServersTableQuery);

    // 3. Thresholds and History (Existing but ensured)
    const createSupportTablesQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ServerThresholds' AND xtype='U')
      CREATE TABLE ServerThresholds (
          ServerId INT PRIMARY KEY FOREIGN KEY REFERENCES MonitoredServers(Id) ON DELETE CASCADE,
          MaxCpuPercent INT DEFAULT 80,
          MaxTempDbPercent INT DEFAULT 80,
          MaxBlockedProcesses INT DEFAULT 5,
          MaxFailedJobs INT DEFAULT 0,
          MaxDiskPercent INT DEFAULT 80,
          CritDiskPercent INT DEFAULT 90,
          UpdatedAt DATETIME DEFAULT GETDATE()
      )

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MetricsHistory' AND xtype='U')
      CREATE TABLE MetricsHistory (
          Id BIGINT PRIMARY KEY IDENTITY(1,1),
          ServerId INT FOREIGN KEY REFERENCES MonitoredServers(Id) ON DELETE CASCADE,
          SnapshotTime DATETIME DEFAULT GETDATE(),
          CpuPercent INT NULL,
          ActiveQueries INT NULL,
          TempDbPercent FLOAT NULL,
          BlockedProcesses INT NULL,
          FailedJobs INT NULL,
          DiskUsedPercent FLOAT NULL
      )

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AlertHistory' AND xtype='U')
      CREATE TABLE AlertHistory (
          Id BIGINT PRIMARY KEY IDENTITY(1,1),
          ServerId INT FOREIGN KEY REFERENCES MonitoredServers(Id) ON DELETE CASCADE,
          AlertTime DATETIME DEFAULT GETDATE(),
          MetricName NVARCHAR(50),
          MetricValue FLOAT,
          ThresholdValue FLOAT,
          Message NVARCHAR(MAX),
          IsResolved BIT DEFAULT 0
      )

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CustomAlerts' AND xtype='U')
      CREATE TABLE CustomAlerts (
          Id INT PRIMARY KEY IDENTITY(1,1),
          ServerId INT FOREIGN KEY REFERENCES MonitoredServers(Id) ON DELETE CASCADE,
          AlertName NVARCHAR(100) NOT NULL,
          QueryText NVARCHAR(MAX) NOT NULL,
          WarningThreshold FLOAT NOT NULL,
          CriticalThreshold FLOAT NOT NULL,
          ComparisonType NVARCHAR(10) DEFAULT '>',
          IsActive BIT DEFAULT 1,
          CreatedAt DATETIME DEFAULT GETDATE()
      )
    `;
    await request.query(createSupportTablesQuery);

    // 4. Lookup Tables
    const createLookupTablesQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Environments' AND xtype='U')
      CREATE TABLE Lookup_Environments (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE, Color NVARCHAR(20))
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Roles' AND xtype='U')
      CREATE TABLE Lookup_Roles (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE)
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Locations' AND xtype='U')
      CREATE TABLE Lookup_Locations (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE)
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Criticality' AND xtype='U')
      CREATE TABLE Lookup_Criticality (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE, Color NVARCHAR(20))
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_Groups' AND xtype='U')
      CREATE TABLE Lookup_Groups (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(50) UNIQUE)
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Lookup_MonitoringOptions' AND xtype='U')
      CREATE TABLE Lookup_MonitoringOptions (Id INT PRIMARY KEY IDENTITY(1,1), Name NVARCHAR(100) UNIQUE, Category NVARCHAR(50))
    `;
    await request.query(createLookupTablesQuery);

    // 5. Seeding Default Data
    const seedQuery = `
      -- Environments
      IF NOT EXISTS (SELECT 1 FROM Lookup_Environments)
      INSERT INTO Lookup_Environments (Name, Color) VALUES 
      ('PROD', '#ef4444'), ('DR', '#f59e0b'), ('TEST', '#38bdf8'), ('DEV', '#10b981'), ('UAT', '#8b5cf6'), ('QA', '#ec4899')

      -- Roles
      IF NOT EXISTS (SELECT 1 FROM Lookup_Roles)
      INSERT INTO Lookup_Roles (Name) VALUES 
      ('Primary'), ('Secondary'), ('ReadOnly'), ('Reporting'), ('Backup'), ('Listener'), ('Standalone')

      -- Locations
      IF NOT EXISTS (SELECT 1 FROM Lookup_Locations)
      INSERT INTO Lookup_Locations (Name) VALUES 
      ('Ankara'), ('Gebze'), ('Cloud'), ('Azure'), ('AWS')

      -- Criticality
      IF NOT EXISTS (SELECT 1 FROM Lookup_Criticality)
      INSERT INTO Lookup_Criticality (Name, Color) VALUES 
      ('Critical', '#ef4444'), ('High', '#f59e0b'), ('Medium', '#38bdf8'), ('Low', '#94a3b8')

      -- Monitoring Options
      IF NOT EXISTS (SELECT 1 FROM Lookup_MonitoringOptions)
      INSERT INTO Lookup_MonitoringOptions (Name, Category) VALUES 
      ('CPU', 'Performance'), ('Memory', 'Performance'), ('Disk', 'Resources'), ('SQL Services', 'Health'), 
      ('Always On', 'HA/DR'), ('Log Shipping', 'HA/DR'), ('Backup Status', 'Management'), ('Job Status', 'Management'), 
      ('Blocking', 'Performance'), ('Long Running Queries', 'Performance'), ('Wait Stats', 'Performance'), 
      ('Database Growth', 'Resources'), ('Error Log', 'Health'), ('Mail Queue', 'Health'), ('Custom Query Checks', 'Custom')
    `;
    await request.query(seedQuery);

    console.log('Database Schema V3 (Advanced Management) is ready.');
  } catch (err) {
    console.error('Error initializing database: ', err);
  }
}

function parseConnectionString(connStr) {
  const parts = connStr.split(';');
  const config = { options: { encrypt: false, trustServerCertificate: true } };
  
  parts.forEach(part => {
    const [key, value] = part.split('=').map(s => s.trim());
    if (!key || !value) return;
    
    const keyLower = key.toLowerCase();
    if (keyLower === 'data source' || keyLower === 'server') {
        config.server = value === '.' ? 'localhost' : value;
    } else if (keyLower === 'initial catalog' || keyLower === 'database') {
        config.database = value;
    } else if (keyLower === 'user id' || keyLower === 'uid') {
        config.user = value;
    } else if (keyLower === 'password' || keyLower === 'pwd') {
        config.password = value;
    }
  });

  return config;
}

async function connectWithParsedConfig(connStr) {
    const targetConfig = parseConnectionString(connStr);
    try {
        const pool = new sql.ConnectionPool(targetConfig);
        await pool.connect();
        return pool;
    } catch (error) {
        throw new Error('Failed to connect with parsed config: ' + error.message);
    }
}

// Support for detailed connection object
async function connectWithParams(params) {
    const targetConfig = {
        server: params.ServerName.split('\\')[0],
        database: 'master', // default
        user: params.Username,
        password: params.Password,
        options: {
            encrypt: params.Encrypt === 1,
            trustServerCertificate: params.TrustCert === 1,
            connectTimeout: (params.ConnTimeout || 15) * 1000
        }
    };
    
    // Handle instance names
    if (params.ServerName.includes('\\')) {
        targetConfig.options.instanceName = params.ServerName.split('\\')[1];
    }

    try {
        const pool = new sql.ConnectionPool(targetConfig);
        await pool.connect();
        return pool;
    } catch (error) {
        throw new Error('Params connection failed: ' + error.message);
    }
}

module.exports = {
  sql,
  poolPromise,
  initializeDB,
  connectWithParsedConfig,
  connectWithParams
};
