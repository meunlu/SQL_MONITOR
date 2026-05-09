import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl } from 'react-native';
import { Title, Text, Card, useTheme, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getKpiSummary } from '../services/api';

const { width } = Dimensions.get('window');
const itemWidth = (width - 48) / 2;

// Original 12 categories
const METRIC_CATEGORIES = [
  { id: 'active-queries', title: 'Active Queries', icon: 'run-fast', columns: [ {key: 'session_id', label: 'SPID', width: 60}, {key: 'login_name', label: 'Login', width: 100}, {key: 'status', label: 'Status', width: 80}, {key: 'sql_text', label: 'SQL Text', width: 300} ]},
  { id: 'waits', title: 'Wait Stats', icon: 'timer-sand', columns: [ {key: 'wait_type', label: 'Wait Type', width: 180}, {key: 'wait_time_ms', label: 'Time (ms)', numeric: true}, {key: 'waiting_tasks_count', label: 'Count', numeric: true} ]},
  { id: 'cpu-memory', title: 'CPU & Memory', icon: 'memory', columns: [ {key: 'ram_mb_used', label: 'RAM Used (MB)', numeric: true} ]},
  { id: 'io', title: 'Disk I/O', icon: 'harddisk', columns: [ {key: 'db_name', label: 'Database'}, {key: 'reads', label: 'Reads', numeric: true}, {key: 'writes', label: 'Writes', numeric: true} ]},
  { id: 'tempdb', title: 'TempDB', icon: 'thermometer', columns: [ {key: 'free_mb', label: 'Free (MB)', numeric: true}, {key: 'version_store_mb', label: 'Version Store', numeric: true}, {key: 'user_obj_mb', label: 'User Obj', numeric: true} ]},
  { id: 'logs', title: 'Transaction Logs', icon: 'math-log', columns: [ {key: 'Database Name', label: 'Database', width: 150}, {key: 'Log Size (MB)', label: 'Size (MB)', numeric: true}, {key: 'Log Space Used (%)', label: 'Used %', numeric: true} ]},
  { id: 'indexes', title: 'Index Frag.', icon: 'format-list-numbered', columns: [ {key: 'db', label: 'DB'}, {key: 'table_name', label: 'Table'}, {key: 'avg_fragmentation_in_percent', label: 'Frag %', numeric: true} ]},
  { id: 'databases', title: 'Databases', icon: 'database', columns: [ {key: 'name', label: 'Name', width: 150}, {key: 'size_mb', label: 'Size (MB)', numeric: true}, {key: 'state_desc', label: 'State'} ]},
  { id: 'backups', title: 'Backups', icon: 'backup-restore', columns: [ {key: 'database_name', label: 'DB', width: 150}, {key: 'type', label: 'Type', width: 60}, {key: 'backup_finish_date', label: 'Finish Date', width: 180}, {key: 'size_mb', label: 'Size (MB)', numeric: true} ]},
  { id: 'alwayson', title: 'AlwaysOn HA', icon: 'server-network', columns: [ {key: 'replica_server_name', label: 'Server'}, {key: 'role_desc', label: 'Role'}, {key: 'connected_state_desc', label: 'State'}, {key: 'synchronization_health_desc', label: 'Health'} ]},
  { id: 'jobs', title: 'SQL Agent Jobs', icon: 'robot', columns: [ {key: 'name', label: 'Job Name', width: 200}, {key: 'status', label: 'Status', width: 100}, {key: 'start_execution_date', label: 'Last Start', width: 150} ]},
  { id: 'security', title: 'Security', icon: 'shield-account', columns: [ {key: 'name', label: 'Login'}, {key: 'type_desc', label: 'Type'}, {key: 'is_disabled', label: 'Disabled?'}, {key: 'create_date', label: 'Created At', width: 150} ]},
];

export default function ServerDetailScreen({ route, navigation }) {
  const { server } = route.params;
  const theme = useTheme();
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchKpi = async () => {
    try {
      const response = await getKpiSummary(server.Id);
      setKpi(response.data);
    } catch (error) {
      console.error('Failed to fetch KPI', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchKpi();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchKpi();
  };

  // Helper to determine background color and summary text based on KPI thresholds
  const getKpiDisplay = (categoryId) => {
    let bgColor = theme.colors.surface; // Default
    let summaryText = 'Click to analyze';
    let textColor = theme.colors.onSurface;

    const GREEN = '#1B5E20';
    const YELLOW = '#F57F17';
    const RED = '#B71C1C';
    const WHITE = '#FFFFFF';

    if (!kpi) return { bgColor, summaryText, textColor: theme.colors.onSurface };

    switch (categoryId) {
      case 'active-queries':
        summaryText = `${kpi.activeQueries} Running`;
        if (kpi.activeQueries > 50) { bgColor = RED; textColor = WHITE; }
        else if (kpi.activeQueries > 20) { bgColor = YELLOW; textColor = WHITE; }
        else { bgColor = GREEN; textColor = WHITE; }
        break;
      case 'waits':
        summaryText = `${kpi.blocked} Blocked`;
        if (kpi.blocked > 5) { bgColor = RED; textColor = WHITE; }
        else if (kpi.blocked > 0) { bgColor = YELLOW; textColor = WHITE; }
        else { bgColor = GREEN; textColor = WHITE; }
        break;
      case 'tempdb':
        summaryText = `${kpi.tempdbPercent.toFixed(1)}% Used`;
        if (kpi.tempdbPercent > 80) { bgColor = RED; textColor = WHITE; }
        else if (kpi.tempdbPercent > 60) { bgColor = YELLOW; textColor = WHITE; }
        else { bgColor = GREEN; textColor = WHITE; }
        break;
      case 'jobs':
        summaryText = `${kpi.failedJobs} Failed (24h)`;
        if (kpi.failedJobs > 0) { bgColor = RED; textColor = WHITE; }
        else { bgColor = GREEN; textColor = WHITE; }
        break;
      default:
        // Other metrics don't have direct live summary in the KPI endpoint yet.
        break;
    }

    return { bgColor, summaryText, textColor };
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Title style={styles.headerTitle}>{server.ServerName}</Title>
          <Icon 
            name="cog" 
            size={28} 
            color={theme.colors.onSurface} 
            onPress={() => navigation.navigate('Thresholds', { server })}
            style={{ marginLeft: 10 }}
          />
        </View>
        <Text style={{ color: server.status === 'online' ? '#4CAF50' : theme.colors.error }}>
          Status: {server.status}
        </Text>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.gridContainer}>
          {METRIC_CATEGORIES.map((category) => {
            const { bgColor, summaryText, textColor } = getKpiDisplay(category.id);
            
            return (
              <TouchableOpacity 
                key={category.id} 
                activeOpacity={0.8}
                onPress={() => navigation.navigate('MetricDetail', {
                  server,
                  title: category.title,
                  endpointUrl: category.id,
                  columns: category.columns
                })}
              >
                <Card style={[styles.gridItem, { backgroundColor: bgColor }]}>
                  <View style={styles.cardContent}>
                    <Icon name={category.icon} size={32} color={textColor} style={{opacity: 0.9}} />
                    <Text style={[styles.cardTitle, { color: textColor }]}>{category.title}</Text>
                    <Text style={[styles.cardSummary, { color: textColor, opacity: 0.8 }]}>{summaryText}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { marginBottom: 20, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  gridItem: {
    width: itemWidth,
    height: 120,
    marginBottom: 16,
    elevation: 4,
    borderRadius: 12,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  cardTitle: {
    marginTop: 8,
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
  },
  cardSummary: {
    marginTop: 4,
    fontSize: 12,
    textAlign: 'center',
  }
});
