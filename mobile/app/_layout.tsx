import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0f172a', // slate-900
          },
          headerTintColor: '#f8fafc', // slate-50
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 18,
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: '#020617', // slate-950
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'OpsLens Dashboard',
          }}
        />
        <Stack.Screen
          name="scan"
          options={{
            title: 'Scan Asset QR',
          }}
        />
        <Stack.Screen
          name="asset/[id]"
          options={{
            title: 'Asset Registry Detail',
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
