import type { EasingFunction } from '../../Easing';
import { Easing } from '../../Easing';
import { withDelay, withSequence, withTiming } from '../../animation';
import type {
  AnimationFunction,
  EntryExitAnimationFunction,
  IEntryExitAnimationBuilder,
  KeyframeProps,
  StylePropsWithArrayTransform,
} from './commonTypes';
import type { StyleProps } from '../../commonTypes';
import type { TransformArrayItem } from '../../helperTypes';
import { ReduceMotion } from '../../commonTypes';
import { getReduceMotionFromConfig } from '../../animation/util';

interface KeyframePoint {
  duration: number;
  value: number | string;
  easing?: EasingFunction;
}
interface ParsedKeyframesDefinition {
  initialValues: StyleProps;
  keyframes: Record<string, KeyframePoint[]>;
}
class InnerKeyframe implements IEntryExitAnimationBuilder {
  durationV?: number;
  delayV?: number;
  reduceMotionV: ReduceMotion = ReduceMotion.System;
  callbackV?: (finished: boolean) => void;
  definitions: Record<string, KeyframeProps>;

  /*
    Keyframe definition should be passed in the constructor as the map
    which keys are between range 0 - 100 (%) and correspond to the point in the animation progress.
  */
  constructor(definitions: Record<string, KeyframeProps>) {
    this.definitions = definitions;
  }

  private parseDefinitions(): ParsedKeyframesDefinition {
    /* 
        Each style property contain an array with all their key points: 
        value, duration of transition to that value, and optional easing function (defaults to Linear)
    */
    const parsedKeyframes: Record<string, KeyframePoint[]> = {};
    /*
      Parsing keyframes 'from' and 'to'.
    */
    if (this.definitions.from) {
      if (this.definitions['0']) {
        throw new Error(
          "[Reanimated] You cannot provide both keyframe 0 and 'from' as they both specified initial values."
        );
      }
      this.definitions['0'] = this.definitions.from;
      delete this.definitions.from;
    }
    if (this.definitions.to) {
      if (this.definitions['100']) {
        throw new Error(
          "[Reanimated] You cannot provide both keyframe 100 and 'to' as they both specified values at the end of the animation."
        );
      }
      this.definitions['100'] = this.definitions.to;
      delete this.definitions.to;
    }
    /* 
       One of the assumptions is that keyframe  0 is required to properly set initial values.
       Every other keyframe should contain properties from the set provided as initial values.
    */
    if (!this.definitions['0']) {
      throw new Error(
        "[Reanimated] Please provide 0 or 'from' keyframe with initial state of your object."
      );
    }
    const initialValues: StyleProps = this.definitions['0'] as StyleProps;
    /*
      Initialize parsedKeyframes for properties provided in initial keyframe
    */
    Object.keys(initialValues).forEach((styleProp: string) => {
      if (styleProp === 'transform') {
        if (!Array.isArray(initialValues.transform)) {
          return;
        }
        initialValues.transform.forEach((transformStyle, index) => {
          Object.keys(transformStyle).forEach((transformProp: string) => {
            parsedKeyframes[index.toString() + '_transform:' + transformProp] =
              [];
          });
        });
      } else {
        parsedKeyframes[styleProp] = [];
      }
    });

    const duration: number = this.durationV ? this.durationV : 500;
    const animationKeyPoints: Array<string> = Array.from(
      Object.keys(this.definitions)
    );

    const getAnimationDuration = (
      key: string,
      currentKeyPoint: number
    ): number => {
      const maxDuration = (currentKeyPoint / 100) * duration;
      const currentDuration = parsedKeyframes[key].reduce(
        (acc: number, value: KeyframePoint) => acc + value.duration,
        0
      );
      return maxDuration - currentDuration;
    };

    /* 
       Other keyframes can't contain properties that were not specified in initial keyframe.
    */
    const addKeyPoint = ({
      key,
      value,
      currentKeyPoint,
      easing,
    }: {
      key: string;
      value: string | number;
      currentKeyPoint: number;
      easing?: EasingFunction;
    }): void => {
      if (!(key in parsedKeyframes)) {
        throw new Error(
          "[Reanimated] Keyframe can contain only that set of properties that were provide with initial values (keyframe 0 or 'from')"
        );
      }
      parsedKeyframes[key].push({
        duration: getAnimationDuration(key, currentKeyPoint),
        value: value,
        easing: easing,
      });
    };
    animationKeyPoints
      .filter((value: string) => parseInt(value) !== 0)
      .sort((a: string, b: string) => parseInt(a) - parseInt(b))
      .forEach((keyPoint: string) => {
        if (parseInt(keyPoint) < 0 || parseInt(keyPoint) > 100) {
          throw new Error(
            '[Reanimated] Keyframe should be in between range 0 - 100.'
          );
        }
        const keyframe: KeyframeProps = this.definitions[keyPoint];
        const easing = keyframe.easing;
        delete keyframe.easing;
        const addKeyPointWith = (key: string, value: string | number) =>
          addKeyPoint({
            key,
            value,
            currentKeyPoint: parseInt(keyPoint),
            easing,
          });
        Object.keys(keyframe).forEach((key: string) => {
          if (key === 'transform') {
            if (!Array.isArray(keyframe.transform)) {
              return;
            }
            keyframe.transform.forEach(
              (transformStyle: { [key: string]: any }, index) => {
                Object.keys(transformStyle).forEach((transformProp: string) => {
                  addKeyPointWith(
                    index.toString() + '_transform:' + transformProp,
                    transformStyle[transformProp]
                  );
                });
              }
            );
          } else {
            addKeyPointWith(key, keyframe[key]);
          }
        });
      });
    return { initialValues: initialValues, keyframes: parsedKeyframes };
  }

  duration(durationMs: number): InnerKeyframe {
    this.durationV = durationMs;
    return this;
  }

  delay(delayMs: number): InnerKeyframe {
    this.delayV = delayMs;
    return this;
  }

  withCallback(callback: (finsihed: boolean) => void): InnerKeyframe {
    this.callbackV = callback;
    return this;
  }

  reduceMotion(reduceMotionV: ReduceMotion): this {
    this.reduceMotionV = reduceMotionV;
    return this;
  }

  private getDelayFunction(): AnimationFunction {
    const delay = this.delayV;
    const reduceMotion = this.reduceMotionV;
    return delay
      ? (delay, animation) => {
          'worklet';
          return withDelay(delay, animation, reduceMotion);
        }
      : (_, animation) => {
          'worklet';
          animation.reduceMotion = getReduceMotionFromConfig(reduceMotion);
          return animation;
        };
  }

  build = (): EntryExitAnimationFunction => {
    const delay = this.delayV;
    const delayFunction = this.getDelayFunction();
    const { keyframes, initialValues } = this.parseDefinitions();
    const callback = this.callbackV;

    return () => {
      'worklet';
      const animations: StylePropsWithArrayTransform = {};

      /* 
            For each style property, an animations sequence is created that corresponds with its key points.
            Transform style properties require special handling because of their nested structure.
      */
      const addAnimation = (key: string) => {
        const keyframePoints = keyframes[key];
        // in case if property was only passed as initial value
        if (keyframePoints.length === 0) {
          return;
        }
        const animation = delayFunction(
          delay,
          keyframePoints.length === 1
            ? withTiming(keyframePoints[0].value, {
                duration: keyframePoints[0].duration,
                easing: keyframePoints[0].easing
                  ? keyframePoints[0].easing
                  : Easing.linear,
              })
            : withSequence.apply(
                this,
                keyframePoints.map((keyframePoint: KeyframePoint) =>
                  withTiming(keyframePoint.value, {
                    duration: keyframePoint.duration,
                    easing: keyframePoint.easing
                      ? keyframePoint.easing
                      : Easing.linear,
                  })
                )
              )
        );
        if (key.includes('transform')) {
          if (!('transform' in animations)) {
            animations.transform = [];
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          animations.transform!.push(<TransformArrayItem>{
            [key.split(':')[1]]: animation,
          });
        } else {
          animations[key] = animation;
        }
      };
      Object.keys(initialValues).forEach((key: string) => {
        if (key.includes('transform')) {
          initialValues[key].forEach(
            (transformProp: Record<string, number | string>, index: number) => {
              Object.keys(transformProp).forEach((transformPropKey: string) => {
                addAnimation(
                  index.toString() + '_transform:' + transformPropKey
                );
              });
            }
          );
        } else {
          addAnimation(key);
        }
      });
      return {
        animations: animations,
        initialValues: initialValues,
        callback: callback,
      };
    };
  };
}

// TODO TYPESCRIPT This is a temporary type to get rid of .d.ts file.
export declare class ReanimatedKeyframe {
  constructor(definitions: Record<string, KeyframeProps>);
  duration(durationMs: number): ReanimatedKeyframe;
  delay(delayMs: number): ReanimatedKeyframe;
  reduceMotion(reduceMotionV: ReduceMotion): ReanimatedKeyframe;
  withCallback(callback: (finished: boolean) => void): ReanimatedKeyframe;
}

// TODO TYPESCRIPT This temporary cast is to get rid of .d.ts file.
export const Keyframe = InnerKeyframe as unknown as typeof ReanimatedKeyframe;
