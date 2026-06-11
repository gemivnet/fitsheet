// RootTabs.tsx — bottom tabs (Home · Food · Weight · Activity · More). Food/Weight/More are
// native-stacks so their sub-screens push cleanly.

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components';
import { Font, useTheme } from '../theme';
import {
  ActivityScreen,
  AddFoodScreen,
  AnalyticsScreen,
  DishBuilderScreen,
  FoodDayScreen,
  HomeScreen,
  LabelCaptureScreen,
  LogWeightScreen,
  MealPlanScreen,
  MoreHubScreen,
  NotesScreen,
  RecipesScreen,
  SettingsScreen,
  WeightScreen,
} from '../screens';
import type { FoodStackParams, MoreStackParams, RootTabParams, WeightStackParams } from './types';

const FoodNav = createNativeStackNavigator<FoodStackParams>();
function FoodStack() {
  return (
    <FoodNav.Navigator screenOptions={{ headerShown: false }}>
      <FoodNav.Screen name="FoodDay" component={FoodDayScreen} />
      <FoodNav.Screen name="AddFood" component={AddFoodScreen} />
      <FoodNav.Screen name="LabelCapture" component={LabelCaptureScreen} />
      <FoodNav.Screen name="DishBuilder" component={DishBuilderScreen} />
    </FoodNav.Navigator>
  );
}

const WeightNav = createNativeStackNavigator<WeightStackParams>();
function WeightStack() {
  return (
    <WeightNav.Navigator screenOptions={{ headerShown: false }}>
      <WeightNav.Screen name="Weight" component={WeightScreen} />
      <WeightNav.Screen name="LogWeight" component={LogWeightScreen} options={{ presentation: 'modal' }} />
    </WeightNav.Navigator>
  );
}

const MoreNav = createNativeStackNavigator<MoreStackParams>();
function MoreStack() {
  return (
    <MoreNav.Navigator screenOptions={{ headerShown: false }}>
      <MoreNav.Screen name="MoreHub" component={MoreHubScreen} />
      <MoreNav.Screen name="Notes" component={NotesScreen} />
      <MoreNav.Screen name="Recipes" component={RecipesScreen} />
      <MoreNav.Screen name="MealPlan" component={MealPlanScreen} />
      <MoreNav.Screen name="Analytics" component={AnalyticsScreen} />
      <MoreNav.Screen name="Settings" component={SettingsScreen} />
    </MoreNav.Navigator>
  );
}

const TAB_ICON: Record<keyof RootTabParams, IconName> = {
  Home: 'home',
  Food: 'food',
  Weight: 'weight',
  Activity: 'activity',
  More: 'more',
};

const Tab = createBottomTabNavigator<RootTabParams>();

export function RootTabs() {
  const t = useTheme();
  // Pad the tab bar by the bottom safe-area inset so the buttons clear the iOS home indicator
  // when the PWA runs full-screen from the home screen (otherwise they get clipped).
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.text3,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.hairline,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: Font[700], fontSize: 12 },
        tabBarIcon: ({ color, focused }) => <Icon name={TAB_ICON[route.name]} size={26} color={color} stroke={focused ? 2.4 : 2} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Food" component={FoodStack} />
      <Tab.Screen name="Weight" component={WeightStack} />
      <Tab.Screen name="Activity" component={ActivityScreen} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}
