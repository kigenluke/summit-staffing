/**
 * Summit Staffing – Bottom Tab Navigator (after login)
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DashboardScreen } from '../screens/DashboardScreen.js';
import { SearchWorkersScreen } from '../screens/SearchWorkersScreen.js';
import { BookingsScreen } from '../screens/BookingsScreen.js';
import { MessagesScreen } from '../screens/MessagesScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { Colors } from '../constants/theme.js';
import { useAuthStore } from '../store/authStore.js';

const Tab = createBottomTabNavigator();

function MessagesHeaderRight() {
  const nav = useNavigation();
  return (
    <Pressable
      onPress={() => nav.navigate('SelectMessageRecipient' as never)}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, paddingHorizontal: 12, paddingVertical: 8 })}
    >
      <Text style={{ color: Colors.text.white, fontWeight: '600', fontSize: 15 }}>New</Text>
    </Pressable>
  );
}

export function MainTabs() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.text.white,
        headerTitleStyle: { fontWeight: '700' as const },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.text.muted,
        tabBarStyle: {
          paddingBottom: 20,
          paddingTop: 8,
          height: 70,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
        },
        tabBarIcon: () => null,
        tabBarLabel: ({ color, focused }) => (
          <Text style={{
            fontSize: 13,
            fontWeight: focused ? '700' : '500',
            color,
            textAlign: 'center',
          }}>{route.name}</Text>
        ),
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ title: 'Summit Staffing' }} />
      {!isWorker && (
        <Tab.Screen name="Search" component={SearchWorkersScreen} options={{ title: 'Find Workers' }} />
      )}
      <Tab.Screen name="Bookings" component={BookingsScreen} options={{ title: 'Bookings' }} />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: 'Messages', headerRight: () => <MessagesHeaderRight /> }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
