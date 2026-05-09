import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { FAB, Card, Title, Paragraph, useTheme, ActivityIndicator, IconButton } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { getServers, getServerStatus, deleteServer } from '../services/api';

export default function DashboardScreen({ navigation }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const theme = useTheme();

  const fetchServers = async () => {
    try {
      const response = await getServers();
      const serverList = response.data.map(s => ({ ...s, status: 'checking' }));
      setServers(serverList);
      checkStatuses(serverList);
    } catch (error) {
      console.error('Error fetching servers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const checkStatuses = async (serverList) => {
    for (let server of serverList) {
      try {
        const res = await getServerStatus(server.Id);
        setServers(prev => prev.map(s => s.Id === server.Id ? { ...s, status: res.data.status, version: res.data.version } : s));
      } catch (err) {
        setServers(prev => prev.map(s => s.Id === server.Id ? { ...s, status: 'offline' } : s));
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchServers();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchServers();
  };

  const handleDelete = async (id) => {
    try {
      await deleteServer(id);
      fetchServers();
    } catch (error) {
      console.error('Failed to delete server', error);
    }
  };

  const renderItem = ({ item }) => {
    let statusColor = '#FFA500'; // warning/checking
    if (item.status === 'online') statusColor = '#4CAF50';
    if (item.status === 'offline') statusColor = '#F44336';

    return (
      <Card 
        style={styles.card} 
        onPress={() => navigation.navigate('ServerDetail', { server: item })}
      >
        <Card.Title 
          title={item.ServerName} 
          subtitle={item.status === 'checking' ? 'Checking status...' : (item.version ? item.version.split('-')[0].trim() : 'Unknown Version')}
          left={(props) => (
            <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
          )}
          right={(props) => (
             <IconButton
              {...props}
              icon="delete"
              iconColor={theme.colors.error}
              onPress={() => handleDelete(item.Id)}
            />
          )}
        />
      </Card>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={servers}
        keyExtractor={item => item.Id.toString()}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Paragraph style={styles.emptyText}>No servers found. Add one!</Paragraph>}
      />
      
      <FAB
        style={styles.fab}
        icon="plus"
        onPress={() => navigation.navigate('AddServer')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    marginBottom: 12,
    elevation: 4,
  },
  statusIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    opacity: 0.7,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
