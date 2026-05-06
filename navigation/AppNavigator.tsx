/**
 * Summit Staffing – root navigator: Auth stack when logged out, Main stack when logged in.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Text } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { WorkerDetailScreen } from '../screens/WorkerDetailScreen.js';
import { ChatScreen } from '../screens/MessagesScreen.js';
import { SelectMessageRecipientScreen } from '../screens/SelectMessageRecipientScreen.js';
import { BookingDetailScreen } from '../screens/BookingDetailScreen.js';
import { WorkerManageScreen } from '../screens/WorkerManageScreen.js';
import { InvoicesScreen } from '../screens/InvoicesScreen.js';
import { PaymentsScreen } from '../screens/PaymentsScreen.js';
import { NotificationsScreen } from '../screens/NotificationsScreen.js';
import { TermsScreen } from '../screens/TermsScreen.js';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen.js';
import { ReviewsScreen } from '../screens/ReviewsScreen.js';
import { AvailableShiftsScreen } from '../screens/AvailableShiftsScreen.js';
import { HelpScreen } from '../screens/HelpScreen.js';
import { DocumentsScreen } from '../screens/DocumentsScreen.js';
import { EarningsScreen } from '../screens/EarningsScreen.js';
import { EarningsDashboard } from '../screens/EarningsDashboard.js';
import { BudgetScreen } from '../screens/BudgetScreen.js';
import { TrainingScreen } from '../screens/TrainingScreen.js';
import { EditProfileScreen } from '../screens/EditProfileScreen.js';
import { AddIncidentScreen } from '../screens/AddIncidentScreen.js';
import { AddComplaintScreen } from '../screens/AddComplaintScreen.js';
import { CoordinatorParticipantManageScreen } from '../screens/CoordinatorParticipantManageScreen.js';
import { Colors } from '../constants/theme.js';
import { WorkerGateProvider } from '../context/WorkerGateContext.js';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <AuthStack />;
  }

  return (
    <WorkerGateProvider>
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.text.white,
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitleVisible: false,
        headerLeft: ({ canGoBack, tintColor }) => canGoBack ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({ paddingRight: 12, opacity: pressed ? 0.7 : 1 })}
            hitSlop={8}
          >
            <Text style={{ color: tintColor || Colors.text.white, fontSize: 24, fontWeight: '700', lineHeight: 24 }}>
              ←
            </Text>
          </Pressable>
        ) : null,
      })}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="WorkerDetail" component={WorkerDetailScreen} options={{ title: 'Worker Profile' }} />
      <Stack.Screen
        name="SelectMessageRecipient"
        component={SelectMessageRecipientScreen}
        options={{ title: 'Start a conversation' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({ title: route.params?.otherUserName || 'Chat' })}
      />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} options={{ title: 'Booking Details' }} />
      <Stack.Screen name="WorkerManage" component={WorkerManageScreen} options={{ title: 'My Worker Profile' }} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} options={{ title: 'Invoices' }} />
      <Stack.Screen name="Payments" component={PaymentsScreen} options={{ title: 'Payments' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="Terms" component={TermsScreen} options={{ title: 'Terms & Conditions' }} />
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Admin Panel' }} />
      <Stack.Screen name="Reviews" component={ReviewsScreen} options={{ title: 'Reviews' }} />
      <Stack.Screen name="AvailableShifts" component={AvailableShiftsScreen} options={{ title: 'Find a worker' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ title: 'Help & Support' }} />
      <Stack.Screen name="Documents" component={DocumentsScreen} options={{ title: 'Documents' }} />
      <Stack.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Earnings' }} />
      <Stack.Screen name="EarningsDashboard" component={EarningsDashboard} options={{ title: 'Earnings Dashboard' }} />
      <Stack.Screen name="BudgetDashboard" component={BudgetScreen} options={{ title: 'Budget Dashboard' }} />
      <Stack.Screen name="Training" component={TrainingScreen} options={{ title: 'My Training' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="AddIncident" component={AddIncidentScreen} options={{ title: 'Incident Report' }} />
      <Stack.Screen name="AddComplaint" component={AddComplaintScreen} options={{ title: 'Complaint Report' }} />
      <Stack.Screen name="CoordinatorParticipantManage" component={CoordinatorParticipantManageScreen} options={{ title: 'Manage Participant' }} />
    </Stack.Navigator>
    </WorkerGateProvider>
  );
}
