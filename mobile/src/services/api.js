import axios from 'axios';
import { Platform } from 'react-native';

const getBaseUrl = () => {
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api';
  return 'http://localhost:3000/api';
};

const BASE_URL = getBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // Increased timeout for heavy queries like indexes
});

export const getServers = () => api.get('/servers');
export const addServer = (serverName, connectionString) => api.post('/servers', { serverName, connectionString });
export const deleteServer = (id) => api.delete(`/servers/${id}`);
export const getServerStatus = (id) => api.get(`/servers/${id}/status`);

// DMV Endpoints
export const getActiveQueries = (id) => api.get(`/servers/${id}/dmv/active-queries`);
export const getWaitStats = (id) => api.get(`/servers/${id}/dmv/waits`);
export const getCpuMemory = (id) => api.get(`/servers/${id}/dmv/cpu-memory`);
export const getIoStats = (id) => api.get(`/servers/${id}/dmv/io`);
export const getTempDb = (id) => api.get(`/servers/${id}/dmv/tempdb`);
export const getLogs = (id) => api.get(`/servers/${id}/dmv/logs`);
export const getIndexes = (id) => api.get(`/servers/${id}/dmv/indexes`);
export const getDatabases = (id) => api.get(`/servers/${id}/dmv/databases`);
export const getBackups = (id) => api.get(`/servers/${id}/dmv/backups`);
export const getAlwaysOn = (id) => api.get(`/servers/${id}/dmv/alwayson`);
export const getJobs = (id) => api.get(`/servers/${id}/dmv/jobs`);
export const getSecurity = (id) => api.get(`/servers/${id}/dmv/security`);
export const getKpiSummary = (id) => api.get(`/servers/${id}/kpi-summary`);
export const getThresholds = (id) => api.get(`/servers/${id}/thresholds`);
export const updateThresholds = (id, data) => api.post(`/servers/${id}/thresholds`, data);

export default api;
