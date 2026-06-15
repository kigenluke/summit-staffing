/**
 * Summit Staffing – Bottom Tab Navigator (after login)
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Pressable, View } from 'react-native';
import { NavChevron } from '../components/NavChevron.js';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { DashboardScreen } from '../screens/DashboardScreen.js';
import { CoordinatorDashboardScreen } from '../screens/CoordinatorDashboardScreen.js';
import { SearchWorkersScreen } from '../screens/SearchWorkersScreen.js';
import { BookingsScreen } from '../screens/BookingsScreen.js';
import { MessagesScreen } from '../screens/MessagesScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { WorkerManageScreen } from '../screens/WorkerManageScreen.js';
import { Colors } from '../constants/theme.js';
import { useAuthStore } from '../store/authStore.js';
import { useAccountAccess } from '../context/WorkerGateContext.js';
import { showVerificationRequiredAlert, showExpiredDocumentsAlert } from '../utils/verificationPrompt.js';
import { DocumentExpiryScreen } from '../screens/DocumentExpiryScreen.js';
import { useNotificationStore } from '../store/notificationStore.js';

const Tab = createBottomTabNavigator();

function HomeHeaderRight() {
  const nav = useNavigation();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);

  useFocusEffect(
    React.useCallback(() => {
      refreshUnreadCount();
      return () => {};
    }, [refreshUnreadCount])
  );

  return (
    <Pressable
      onPress={() => {
        nav.navigate('Notifications' as never);
      }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.8 : 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
      })}
    >
      <Text style={{ color: Colors.text.white, fontWeight: '700', fontSize: 18 }}>🔔</Text>
      {unreadCount > 0 && (
        <Text
          style={{
            position: 'absolute',
            top: 2,
            right: 4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: Colors.status.error,
            color: Colors.text.white,
            fontSize: 10,
            fontWeight: '700',
            textAlign: 'center',
            lineHeight: 16,
            paddingHorizontal: 3,
          }}
        >
          {unreadCount > 99 ? '99+' : String(unreadCount)}
        </Text>
      )}
    </Pressable>
  );
}

function MessagesHeaderRight() {
  const nav = useNavigation();
  const { restricted, accessPhase } = useAccountAccess();
  return (
    <Pressable
      onPress={() => {
        if (restricted) {
          if (accessPhase === 'documents_expired') showExpiredDocumentsAlert();
          else showVerificationRequiredAlert();
          return;
        }
        nav.navigate('SelectMessageRecipient' as never);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, paddingHorizontal: 12, paddingVertical: 8 })}
    >
      <Text style={{ color: Colors.text.white, fontWeight: '600', fontSize: 15 }}>New</Text>
    </Pressable>
  );
}

function MessagesHeaderLeft() {
  const nav = useNavigation();
  return (
    <Pressable
      onPress={() => {
        if (typeof nav.canGoBack === 'function' && nav.canGoBack()) nav.goBack();
        else nav.navigate('Home' as never);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, paddingHorizontal: 12, paddingVertical: 8 })}
    >
      <NavChevron direction="left" color={Colors.text.white} size={22} />
    </Pressable>
  );
}

function BookingsHeaderLeft() {
  const nav = useNavigation();
  return (
    <Pressable
      onPress={() => {
        if (typeof nav.canGoBack === 'function' && nav.canGoBack()) nav.goBack();
        else nav.navigate('Home' as never);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, paddingHorizontal: 12, paddingVertical: 8 })}
    >
      <NavChevron direction="left" color={Colors.text.white} size={22} />
    </Pressable>
  );
}

function SearchHeaderLeft() {
  const nav = useNavigation();
  return (
    <Pressable
      onPress={() => {
        if (typeof nav.canGoBack === 'function' && nav.canGoBack()) nav.goBack();
        else nav.navigate('Home' as never);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, paddingHorizontal: 12, paddingVertical: 8 })}
    >
      <NavChevron direction="left" color={Colors.text.white} size={22} />
    </Pressable>
  );
}

function ProfileHeaderLeft() {
  const nav = useNavigation();
  return (
    <Pressable
      onPress={() => {
        if (typeof nav.canGoBack === 'function' && nav.canGoBack()) nav.goBack();
        else nav.navigate('Home' as never);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, paddingHorizontal: 12, paddingVertical: 8 })}
    >
      <NavChevron direction="left" color={Colors.text.white} size={22} />
    </Pressable>
  );
}

function AvailabilityHeaderLeft() {
  const nav = useNavigation();
  return (
    <Pressable
      onPress={() => {
        if (typeof nav.canGoBack === 'function' && nav.canGoBack()) nav.goBack();
        else nav.navigate('Home' as never);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, paddingHorizontal: 12, paddingVertical: 8 })}
    >
      <NavChevron direction="left" color={Colors.text.white} size={22} />
    </Pressable>
  );
}

export function MainTabs() {
  const { user } = useAuthStore();
  const { restricted, accessPhase } = useAccountAccess();
  const isWorker = user?.role === 'worker';
  const isCoordinator = user?.role === 'coordinator';
  const isGatedRole = isWorker;

  if (isGatedRole && accessPhase === 'documents_expired') {
    return <DocumentExpiryScreen />;
  }

  return (
    <Tab.Navigator
      lazy
      detachInactiveScreens
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
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarIcon: () => null,
        tabBarLabel: ({ color, focused }) => (
          <Text style={{
            fontSize: 13,
            fontWeight: focused ? '700' : '500',
            color,
            textAlign: 'center',
            width: '100%',
          }}>{route.name}</Text>
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={isCoordinator ? CoordinatorDashboardScreen : DashboardScreen}
        options={{ title: isCoordinator ? 'Coordinator' : 'Summit Staffing', headerRight: () => <HomeHeaderRight /> }}
      />
      {!isWorker && !isCoordinator && (
        <Tab.Screen
          name="Search"
          component={SearchWorkersScreen}
          options={{ title: 'Find Workers', headerLeft: () => <SearchHeaderLeft /> }}
        />
      )}
      {!isCoordinator && (
        <Tab.Screen name="Bookings" component={BookingsScreen} options={{ title: 'Bookings', headerLeft: () => <BookingsHeaderLeft /> }} />
      )}
      {isWorker && (
        <Tab.Screen
          name="Availability"
          component={WorkerManageScreen}
          initialParams={{ availabilityOnly: true }}
          options={{ title: 'My Availability', headerLeft: () => <AvailabilityHeaderLeft /> }}
        />
      )}
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: 'Messages', headerLeft: () => <MessagesHeaderLeft />, headerRight: () => <MessagesHeaderRight /> }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile', headerLeft: () => <ProfileHeaderLeft /> }} />
    </Tab.Navigator>
  );
}
