// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useContext } from "react";
import { useStore } from "zustand";

import { AppSelectorContext } from "@lichtblick/suite-base/context/AppSelectorContext/AppSelectorContext";

/**
 * 订阅应用选择器的当前应用ID
 */
export function useCurrentAppId(): string | undefined {
  const context = useContext(AppSelectorContext);
  return useStore(context!, (state) => state.currentAppId);
}

/**
 * 订阅应用选择器的自定义应用列表
 */
export function useCustomApps(): import("@lichtblick/suite-base/components/AppSelector/types").AppConfig[] {
  const context = useContext(AppSelectorContext);
  return useStore(context!, (state) => state.customApps);
}
