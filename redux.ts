import { autobind } from "core-decorators";
import * as _ from "lodash";

var process: any;

export interface TypedAction {
  type: string;
}

export interface Action<T> {
  type: ActionType<T>;
  payload: T;
  error?: any;
}

// Encapsulates the state of an single asynchonous flow.
export enum AsyncStatus {
  PRISTINE = 'pristine' as any,
  REQUESTED = 'requested' as any,
  PENDING = 'pending' as any,
  FULFILLED = 'fulfilled' as any,
  FAILED = 'failed' as any
}

export interface AsyncAction<I, O> extends Action<O> {
  status: AsyncStatus;
  input: I;
}

export declare type AsyncActionType<I, O> = string & {
  __input_type?: I;
  __payload_type?: O;
}

export declare type ActionType<T> = string & {
  __payload_type?: T;
};

export interface ActionReducer<S, T> {
  (state: S, action: Action<T>): Partial<S>;
}

export interface ActionCreator<T> {
  (payload: T, error?: any): Action<T>;
}

export interface UpdateActionCreator<T> {
  (payload: T): Action<T>;
}

export const ACTION_TYPE_MERGE = '__merge';
export const ACTION_SEPARATOR = '.';

type SubReducerSet<S> = {
  [P in keyof S]?: (state: S[P], action: Action<any>) => S[P];
}

type Setters<S, K extends keyof S> = {
  [P in K]: (payload: S[P]) => Action<S[P]>;
}

interface BaseAction {
  type: string;
}

type CustomActionType<A extends TypedAction> = string & {
  __action_type?: A;
}

interface CustomActionCreator<A, T1, T2, T3, T4> extends Function {
  (arg1?: T1, arg2?: T2, arg3?: T3, arg4?: T4, ...args: any[]): A;
}

type Names<T, K extends keyof T> = {
  [P in K]: string;
}

export default class Raducer<S> {
  private reducers: {[key: string]: ActionReducer<S, any>} = {};
  private subReducers: SubReducerSet<S> = {} as any;
  private prefix = '';

  public constructor(prefix?: string) {
    this.prefix = prefix || '';
  }

  public addCustomAction<A>(type: CustomActionType<A & BaseAction>) {
    const actionConfig = {
      reducer(func: (state: S, action: A & BaseAction) => Partial<S>) {
        return actionConfig;
      },
      creator<T1, T2, T3, T4>(f: CustomActionCreator<A, T1, T2, T3, T4>): CustomActionCreator<A & BaseAction, T1, T2, T3, T4> {
        return wrapCreator(type, f);
      }
    };
    return actionConfig;
  }

  public addAction<T>(type: ActionType<T>) {
    this.checkActionType(type);
    type = this.prefix + type;
    const actionConfig = {
      reducer: (func: (state: S, action: Action<T>) => Partial<S>) => {
        this.reducers[type] = func;
        return actionConfig;
      },
      creator: () => {
        this.checkActionType(type, true);
        return createActionCreator(type);
      }
    };
    return actionConfig;
  }

  public addAsyncAction<I, O>(type: AsyncActionType<I, O>) {
    this.checkActionType(type);
    type = this.prefix + type;
    const actionConfig = {
      reducer: (func: (state: S, action: AsyncAction<I, O>) => Partial<S>) => {
        this.reducers[type] = func;
        return actionConfig;
      },
      creators: () => {
        this.checkActionType(type, true);
        return createAsyncActionCreators(type);
      },
      creator: () => {
        this.checkActionType(type, true);
        return createOuputActionCreator(type);
      }
    }
    return actionConfig;
  }

  public addSetterAction<Substate extends keyof S>(key: Substate, type?: ActionType<S[Substate]>) {
    type = type || `__set__${key}`;
    type = this.prefix + type;
    this.checkActionType(type);
    this.reducers[type] = (state: S, action: Action<S[Substate]>) => ({[key as string]: action.payload}) as any;
    return {
      creator() {
        return (payload: S[Substate]) => ({ type, payload });
      }
    };
  }

  private checkActionType(type: ActionType<any>, shouldExist = false) {
    let errMessage = null;
    if (!shouldExist && (type in this.reducers)) {
      errMessage = "Duplicate action detected: " + type;
    } else if (shouldExist && !(type in this.reducers)) {
      errMessage = "Reducer not defined for action: " + type;
    }
    if (errMessage && process.env.NODE_ENV === "production") {
      console.warn(errMessage);
    } else if (errMessage) {
      throw new Error(errMessage);
    }
  }

  public substateReducer<Substate extends keyof S>(key: Substate, reducer: (state: S[Substate], action: Action<any>) => S[Substate], prefix?: string) {
    this.subReducers[key] = reducer;
    return this;
  }

  public addSetterActions<Substate extends keyof S>(names: Names<S, Substate>): Setters<S, Substate> {
    const setters: Setters<S, Substate> = {} as any;
    for (let key in names) {
      setters[key] = this.addSetterAction(key, names[key]).creator();
    }
    return setters;
  }

  public reduce(state: S, action: Action<any>): S {
    // if (this.prefix && !action.type.startsWith(this.prefix)) { return state; }
    if (action.type.includes(ACTION_SEPARATOR)) {
      let key = action.type.slice(0, action.type.indexOf(ACTION_SEPARATOR));
      let substate: any = (state as any)[key];
      if (key.includes('[')) {
        let index = key.slice(key.indexOf('[') + 1 , key.indexOf(']'));
        substate = substate[index];
        key = key.slice(0, key.indexOf('['));
      }
      if (!(key in this.subReducers)) {
        // throw an error.
        console.warn(`No sub-reducer defined for ${key} in ${action.type}`);
      }
      action = Object.assign({}, action, {type: action.type.slice(action.type.indexOf(ACTION_SEPARATOR) + 1)});
      return Object.assign({}, state, {[key]: (this.subReducers as any)[key](substate, action)} as any);
    }
    if (action.type in this.reducers) {
      return Object.assign({}, state, this.reducers[action.type](state, action));
    } else if (action.type === ACTION_TYPE_MERGE) {
      return Object.assign({}, state, action.payload);
    }
    return state;
  }

  public reducer() {
    return this.reduce.bind(this);
  }

  public createMergeAction(s: Partial<S>) {
    return {type: ACTION_TYPE_MERGE, payload: s};
  }
}

export interface TypedActionCreator<T> extends Function {
  type: ActionType<T>;
}

export interface SimpleActionCreator<T> extends TypedActionCreator<T> {
  (payload: T): Action<T>;
}

export interface ActionCreator<T> extends TypedActionCreator<T> {
  (payload: T, error?: any): Action<T>;
}

export interface OutputActionCreator<I, O> extends TypedActionCreator<O> {
  (input: I, output: O, error?: any): AsyncAction<I, O>;
}

export interface InputActionCreator<I, O> extends TypedActionCreator<O> {
  (input: I): AsyncAction<I, O>;
}

function createSimpleActionCreator<T>(type: ActionType<T>) {
  const creator: SimpleActionCreator<T> = ((payload: T) => ({ type, payload })) as any;
  creator.type = type;
  return creator;
}

function createActionCreator<T>(type: ActionType<T>) {
  const creator: ActionCreator<T> = ((payload: T, error?: any) => ({type, payload, error})) as any;
  creator.type = type;
  return creator;
}

function createAsyncActionCreators<I, O>(type: AsyncActionType<I,O>) {
  return [createInputActionCreator(type), createOuputActionCreator(type)];
}

function createInputActionCreator<I, O>(type: AsyncActionType<I, O>) {
  return (input?: I) => ({input, type});
}

function wrapCreator<A, T1, T2, T3, T4, T5>(type: ActionType<A>, func: CustomActionCreator<A, T1, T2, T3, T4>): CustomActionCreator<A & BaseAction, T1, T2, T3, T4> {
  return (...args: any[]) => Object.assign({type}, (func as any)(...args));
}

function createOuputActionCreator<I, O>(type: AsyncActionType<I, O>) {
  return (input: I, payload?: O, error?: any) => ({type, input, payload, error});
}
