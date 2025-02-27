import type { Component } from 'react';
import type { Context, ShadowNodeWrapper } from '../commonTypes';
import type { ViewStyle, ImageStyle, TextStyle } from 'react-native';

export type DependencyList = Array<unknown> | undefined;

export interface ContextWithDependencies<TContext extends Context> {
  context: TContext;
  savedDependencies: DependencyList;
}

export interface Descriptor {
  tag: number;
  name: string;
  shadowNodeWrapper: ShadowNodeWrapper;
}

export interface AnimatedRef<T extends Component> {
  current: T | null;
  (component?: T):
    | number // Paper
    | ShadowNodeWrapper // Fabric
    | HTMLElement; // web
}

export type DefaultStyle = ViewStyle | ImageStyle | TextStyle;
