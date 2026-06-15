/** Bottom tab items shared by MainTabs + persistent footer. */

export function getMainTabItems({ isWorker, isCoordinator }) {
  const items = [{ name: 'Home', label: 'Home' }];
  if (!isWorker && !isCoordinator) {
    items.push({ name: 'Search', label: 'Search' });
  }
  if (!isCoordinator) {
    items.push({ name: 'Bookings', label: 'Bookings' });
  }
  if (isWorker) {
    items.push({ name: 'Availability', label: 'Availability' });
  }
  items.push({ name: 'Messages', label: 'Messages' });
  items.push({ name: 'Profile', label: 'Profile' });
  return items;
}

/** Map stack screens to the tab that should appear active in the footer. */
const STACK_SCREEN_TAB = {
  BookingDetail: 'Bookings',
  AvailableShifts: 'Home',
  Notifications: 'Home',
  SelectMessageRecipient: 'Messages',
  Chat: 'Messages',
  WorkerManage: 'Profile',
  Invoices: 'Profile',
  Payments: 'Profile',
  Terms: 'Profile',
  Reviews: 'Profile',
  Help: 'Profile',
  Chatbot: 'Profile',
  Documents: 'Profile',
  Earnings: 'Profile',
  EarningsDashboard: 'Profile',
  BudgetDashboard: 'Home',
  Training: 'Profile',
  EditProfile: 'Profile',
  AddIncident: 'Profile',
  AddComplaint: 'Profile',
  Emergency: 'Profile',
  CoordinatorParticipantManage: 'Home',
  AccessRequests: 'Home',
  CoordinatorSearchParticipant: 'Home',
  ParticipantSearchCoordinator: 'Profile',
  ParticipantCompliance: 'Profile',
  ReferSomeone: 'Profile',
  AdminDashboard: 'Profile',
};

export function resolveActiveMainTab(navState, { isWorker, isCoordinator } = {}) {
  if (!navState?.routes?.length) return 'Home';

  const route = navState.routes[navState.index];
  if (!route) return 'Home';

  if (route.name === 'MainTabs') {
    const tabState = route.state;
    if (tabState?.routes?.length) {
      return tabState.routes[tabState.index]?.name || 'Home';
    }
    return 'Home';
  }

  if (route.name === 'WorkerDetail') {
    return isWorker || isCoordinator ? 'Home' : 'Search';
  }

  return STACK_SCREEN_TAB[route.name] || 'Home';
}
