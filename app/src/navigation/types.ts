// Navigation param lists — typed routes for the bottom tabs + per-tab stacks.

import type { NavigatorScreenParams } from '@react-navigation/native';

export type FoodStackParams = {
  FoodDay: undefined;
  AddFood: { slot: string; date: string };
  LabelCapture: { slot: string; date: string };
  DishBuilder: { slot: string; date: string };
  DiningOut: { slot: string; date: string };
};

export type WeightStackParams = {
  Weight: undefined;
  LogWeight: undefined;
};

export type MoreStackParams = {
  MoreHub: undefined;
  Notes: undefined;
  Recipes: undefined;
  MealPlan: undefined;
  Analytics: undefined;
  Settings: undefined;
};

export type RootTabParams = {
  Home: undefined;
  Food: NavigatorScreenParams<FoodStackParams> | undefined;
  Weight: NavigatorScreenParams<WeightStackParams> | undefined;
  Activity: undefined;
  More: NavigatorScreenParams<MoreStackParams> | undefined;
};
