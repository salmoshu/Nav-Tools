// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { createContext } from "react";
import { StoreApi } from "zustand";

import { AppConfig, AppSelectorStore } from "@lichtblick/suite-base/components/AppSelector/types";

export const AppSelectorContext = createContext<undefined | StoreApi<AppSelectorStore>>(undefined);

AppSelectorContext.displayName = "AppSelectorContext";

/**
 * 获取合并后的应用列表（默认应用 + 自定义应用）
 */
export function getAllApps(customApps: AppConfig[]): AppConfig[] {
  // 导入 DEFAULT_APPS
  const { DEFAULT_APPS } = require("@lichtblick/suite-base/components/AppSelector/types");
  return [...DEFAULT_APPS, ...customApps];
}

/**
 * 根据应用ID获取应用配置
 */
export function getAppById(
  appId: string | undefined,
  customApps: AppConfig[],
): AppConfig | undefined {
  if (!appId) {
    return undefined;
  }
  const allApps = getAllApps(customApps);
  return allApps.find((app) => app.id === appId);
}
