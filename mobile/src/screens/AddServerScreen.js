import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Title, HelperText, useTheme } from 'react-native-paper';
import { addServer } from '../services/api';

export default function AddServerScreen({ navigation }) {
  const [serverName, setServerName] = useState('');
  const [connectionString, setConnectionString] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const theme = useTheme();

  const handleAdd = async () => {
    if (!serverName || !connectionString) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await addServer(serverName, connectionString);
      navigation.goBack();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add server. Check your connection string and ensure the server is accessible.');
    } finally {
      setLoading(false);
    }
  };

  // Example connection string format hint for OLEDB / ADO.NET
  const exampleString = "Server=192.168.1.100;Database=master;User Id=sa;Password=your_password;Encrypt=false";

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Title style={styles.title}>Register SQL Server</Title>
        
        <TextInput
          label="Server Name / Alias"
          value={serverName}
          onChangeText={setServerName}
          mode="outlined"
          style={styles.input}
          placeholder="e.g. Production DB 1"
        />

        <TextInput
          label="Connection String"
          value={connectionString}
          onChangeText={setConnectionString}
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.input}
          placeholder={exampleString}
        />
        <HelperText type="info" visible={true}>
          Example: {exampleString}
        </HelperText>

        {error ? (
          <HelperText type="error" visible={!!error}>
            {error}
          </HelperText>
        ) : null}

        <Button 
          mode="contained" 
          onPress={handleAdd} 
          loading={loading}
          disabled={loading}
          style={styles.button}
        >
          Add Server
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: 16,
  },
  title: {
    marginBottom: 20,
    fontSize: 24,
    fontWeight: 'bold',
  },
  input: {
    marginBottom: 10,
  },
  button: {
    marginTop: 20,
    paddingVertical: 6,
  }
});
