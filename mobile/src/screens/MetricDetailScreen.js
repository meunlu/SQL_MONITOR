import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Title, Card, Text, ActivityIndicator, useTheme, DataTable } from 'react-native-paper';
import api from '../services/api'; // Using generic api.get instead of specific exports

export default function MetricDetailScreen({ route }) {
  const { server, title, endpointUrl, columns } = route.params;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const theme = useTheme();

  const fetchData = async () => {
    setError(null);
    try {
      // Dynamic fetch based on the passed endpoint string
      // e.g. /servers/1/dmv/active-queries
      const response = await api.get(`/servers/${server.Id}/dmv/${endpointUrl}`);
      setData(response.data);
    } catch (err) {
      setError(`Failed to fetch ${title}. Server might be offline or query timed out.`);
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Running DMV Query...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.error, textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Title>{server.ServerName} - {title}</Title>
      </View>

      <Card style={styles.card}>
        <Card.Content>
          <ScrollView horizontal>
            <DataTable>
              <DataTable.Header>
                {columns.map((col, idx) => (
                  <DataTable.Title key={idx} style={{width: col.width || 120}} numeric={col.numeric}>
                    {col.label}
                  </DataTable.Title>
                ))}
              </DataTable.Header>

              {data.length === 0 ? (
                <DataTable.Row>
                  <DataTable.Cell>No data found.</DataTable.Cell>
                </DataTable.Row>
              ) : (
                data.map((row, i) => (
                  <DataTable.Row key={i}>
                    {columns.map((col, idx) => {
                      const cellValue = row[col.key];
                      // Format nulls or objects
                      const displayValue = cellValue === null ? 'NULL' : (typeof cellValue === 'object' ? JSON.stringify(cellValue) : String(cellValue));
                      return (
                        <DataTable.Cell key={idx} style={{width: col.width || 120}} numeric={col.numeric}>
                          <Text numberOfLines={3} ellipsizeMode="tail" style={{fontSize: 12}}>
                            {displayValue}
                          </Text>
                        </DataTable.Cell>
                      );
                    })}
                  </DataTable.Row>
                ))
              )}
            </DataTable>
          </ScrollView>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { marginBottom: 16 },
  card: { elevation: 2, marginBottom: 40 }
});
