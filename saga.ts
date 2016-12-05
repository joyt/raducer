import {ActionType, TypedAction, Action, ACTION_SEPARATOR} from './redux';
import { Store as ReduxStore } from 'redux';
import { take, put, call, fork, select, cancel, actionChannel } from 'redux-saga/effects';
import { emitter } from 'redux-saga/lib/internal/channel';
import { runSaga, buffers, SagaIterator } from 'redux-saga';
import {Channel} from 'redux-saga';

type SagaSet<S> = {
  [P in keyof S]: () => SagaIterator;
}

type EmitterSet<S> = {
  [P in keyof S]: any;
}

type TypedSagaIterator<S> = SagaIterator;

export type Store<S> = Pick<ReduxStore<S>, 'getState'|'dispatch'>;

export default class SagaManager<S> {
  private store: Store<S>;
  private subSagas: SagaSet<S> = {} as any;

  public constructor(store: Store<S>) {
    this.store = store;
  }
  public addSubstateSaga<Substate extends keyof S>(key: Substate, saga: () => SagaIterator) {
    this.subSagas[key] = saga;
    return this;
  }
  public saga(chan: Channel<TypedAction>) {
    return this;
  }
  public *run(chan: Channel<TypedAction>): SagaIterator {
    const emitters: EmitterSet<S> = {} as any;
    for (let key in this.subSagas) {
      const pubsub = emitter();
      runSaga(this.subSagas[key](), {
        subscribe: pubsub.subscribe,
        getState: () => this.store.getState()[key],
        dispatch: (action: TypedAction) => {
          action.type = key + ACTION_SEPARATOR + action.type;
          this.store.dispatch(action)
        }
      });
      emitters[key] = pubsub;
    }
    while (true) {
      const action: TypedAction = yield take(chan);
      for (let key in this.subSagas) {
        if (action.type.startsWith(key + ACTION_SEPARATOR)) {
          const type = action.type.slice(key.length + ACTION_SEPARATOR.length);
          // Emitter unwraps the action's payload so we have to wrap it.
          emitters[key].emit({ type, payload: Object.assign({}, action, { type }) });
        }
      }
    }
  }
}

interface Saga<T, T1, T2, T3> {
  (action: Action<T>,
    p1?: T1,
    p2?: T2,
    p3?: T3,
    ...rest: any[]): SagaIterator;
}

export function* takeLatest<T, T1, T2, T3>(
  actionType: ActionType<T>,
  saga: Saga<T, T1, T2, T3>,
  p1?: T1, p2?: T2, p3?: T3, ...rest: any[]) {
  let lastTask: any;
  while (true) {
    const action: Action<T> = yield take(actionType as any);
    if (lastTask) {
      yield cancel(lastTask);
    }
    lastTask = yield fork(saga as any, action.payload, p1, p2, p3, ...rest);
  }
}
