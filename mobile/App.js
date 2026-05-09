import React from 'react';
import { NavigationContainer, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper';

// Screens
import DashboardScreen from './src/screens/DashboardScreen';
import AddServerScreen from './src/screens/AddServerScreen';
import ServerDetailScreen from './src/screens/ServerDetailScreen';
import MetricDetailScreen from './src/screens/MetricDetailScreen';
import ThresholdsScreen from './src/screens/ThresholdsScreen';

const Stack = createNativeStackNavigator();

// Modern dark theme for SQL DBAs
const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#4CAF50', // A nice green for success/online status
    accent: '#03A9F4',
    background: '#121212',
    surface: '#1E1E1E',
  },
};

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer theme={{
        ...NavigationDarkTheme,
        colors: {
          ...NavigationDarkTheme.colors,
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.onSurface,
          border: '#333',
          notification: theme.colors.error,
        }
      }}>
        <Stack.Navigator 
          initialRouteName="Dashboard"
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.surface,
            },
            headerTintColor: '#fff',
          }}
        >
          <Stack.Screen 
            name="Dashboard" 
            component={DashboardScreen} 
            options={{ title: 'SQL Monitor Dashboard' }}
          />
          <Stack.Screen 
            name="AddServer" 
            component={AddServerScreen} 
            options={{ title: 'Add New Server' }}
          />
          <Stack.Screen 
            name="ServerDetail" 
            component={ServerDetailScreen} 
            options={{ title: 'Server Analysis' }}
          />
          <Stack.Screen 
            name="MetricDetail" 
            component={MetricDetailScreen} 
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen 
            name="Thresholds" 
            component={ThresholdsScreen} 
            options={{ title: 'Eşik Ayarları' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
