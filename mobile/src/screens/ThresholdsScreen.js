import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Title, TextInput, Button, useTheme, Snackbar, ActivityIndicator } from 'react-native-paper';
import { getThresholds, updateThresholds } from '../services/api';

export default function ThresholdsScreen({ route, navigation }) {
  const { server } = route.params;
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  
  const [thresholds, setThresholds] = useState({
    MaxCpuPercent: '80',
    MaxTempDbPercent: '80',
    MaxBlockedProcesses: '5',
    MaxFailedJobs: '0'
  });

  useEffect(() => {
    fetchThresholds();
  }, []);

  const fetchThresholds = async () => {
    try {
      const response = await getThresholds(server.Id);
      setThresholds({
        MaxCpuPercent: String(response.data.MaxCpuPercent),
        MaxTempDbPercent: String(response.data.MaxTempDbPercent),
        MaxBlockedProcesses: String(response.data.MaxBlockedProcesses),
        MaxFailedJobs: String(response.data.MaxFailedJobs)
      });
    } catch (error) {
      setSnackbar({ visible: true, message: 'Ayarlar çekilemedi. Bağlantıyı kontrol edin.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        MaxCpuPercent: parseInt(thresholds.MaxCpuPercent),
        MaxTempDbPercent: parseInt(thresholds.MaxTempDbPercent),
        MaxBlockedProcesses: parseInt(thresholds.MaxBlockedProcesses),
        MaxFailedJobs: parseInt(thresholds.MaxFailedJobs)
      };
      await updateThresholds(server.Id, payload);
      setSnackbar({ visible: true, message: 'Ayarlar başarıyla kaydedildi!' });
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error) {
      setSnackbar({ visible: true, message: 'Kaydetme başarısız oldu.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        <Title style={styles.title}>{server.ServerName} - Eşik Ayarları</Title>
        
        <TextInput
          label="Maksimum CPU Oranı (%)"
          value={thresholds.MaxCpuPercent}
          onChangeText={text => setThresholds({...thresholds, MaxCpuPercent: text})}
          keyboardType="numeric"
          style={styles.input}
          mode="outlined"
        />
        
        <TextInput
          label="Maksimum TempDB Doluluğu (%)"
          value={thresholds.MaxTempDbPercent}
          onChangeText={text => setThresholds({...thresholds, MaxTempDbPercent: text})}
          keyboardType="numeric"
          style={styles.input}
          mode="outlined"
        />

        <TextInput
          label="Maksimum Block Yiyen Sorgu Sayısı"
          value={thresholds.MaxBlockedProcesses}
          onChangeText={text => setThresholds({...thresholds, MaxBlockedProcesses: text})}
          keyboardType="numeric"
          style={styles.input}
          mode="outlined"
        />

        <TextInput
          label="Maksimum Hatalı Job (Son 24 Saat)"
          value={thresholds.MaxFailedJobs}
          onChangeText={text => setThresholds({...thresholds, MaxFailedJobs: text})}
          keyboardType="numeric"
          style={styles.input}
          mode="outlined"
        />

        <Button 
          mode="contained" 
          onPress={handleSave} 
          loading={saving} 
          disabled={saving}
          style={styles.button}
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { marginBottom: 20, textAlign: 'center' },
  input: { marginBottom: 16 },
  button: { marginTop: 8, paddingVertical: 6 }
});
