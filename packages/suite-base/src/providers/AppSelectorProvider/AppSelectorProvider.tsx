// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as _ from "lodash-es";
import { ReactNode, useState } from "react";
import { StoreApi, createStore } from "zustand";
import { persist } from "zustand/middleware";

import { AppSelectorStore } from "@lichtblick/suite-base/components/AppSelector/types";
import { AppSelectorContext } from "@lichtblick/suite-base/context/AppSelectorContext/AppSelectorContext";
import { SESSION_STORAGE_APP_SELECTOR } from "@lichtblick/suite-base/constants/browserStorageKeys";

/**
 * 创建默认的初始状态
 */
export function makeAppSelectorInitialState(): AppSelectorStore {
  return {
    currentAppId: undefined,
    isOpen: true,
    customApps: [],
  };
}

function createAppSelectorStore(
  initialState?: Partial<AppSelectorStore>,
  options?: { disablePersistenceForStorybook?: boolean },
): StoreApi<AppSelectorStore> {
  const stateCreator = () => {
    const store: AppSelectorStore = {
      ...makeAppSelectorInitialState(),
      ...initialState,
    };
    return store;
  };

  if (options?.disablePersistenceForStorybook === true) {
    return createStore<AppSelectorStore>()(stateCreator);
  }

  return createStore<AppSelectorStore>()(
    persist(stateCreator, {
      name: SESSION_STORAGE_APP_SELECTOR,
      version: 1,
      partialize: (state) => {
        // 只持久化当前选择的应用ID和自定义应用列表
        return _.pick(state, ["currentAppId", "customApps"]);
      },
      merge(persistedState, currentState) {
        return _.merge(currentState, persistedState);
      },
    }),
  );
}

export type AppSelectorProviderProps = {
  children?: ReactNode;
  disablePersistenceForStorybook?: boolean;
  initialState?: Partial<AppSelectorStore>;
  storeCreator?: (
    initialState?: Partial<AppSelectorStore>,
    options?: { disablePersistenceForStorybook?: boolean },
  ) => StoreApi<AppSelectorStore>;
};

export default function AppSelectorProvider(props: AppSelectorProviderProps): React.JSX.Element {
  const { children, initialState, storeCreator, disablePersistenceForStorybook } = props;

  const [store] = useState(() =>
    storeCreator
      ? storeCreator(initialState, { disablePersistenceForStorybook })
      : createAppSelectorStore(initialState, { disablePersistenceForStorybook }),
  );

  return <AppSelectorContext.Provider value={store}>{children}</AppSelectorContext.Provider>;
}

/**
 * Hook for accessing the app selector store
 */
export function useAppSelectorStore(): StoreApi<AppSelectorStore> {
  const [store] = useState(() => createAppSelectorStore());
  return store;
}
