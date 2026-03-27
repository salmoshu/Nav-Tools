// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/**
 * 应用配置类型
 */
export type AppConfig = {
  /** 应用ID */
  id: string;
  /** 应用名称 */
  name: string;
  /** 应用描述 */
  description: string;
  /** 应用图标 (emoji 或图标名称) */
  icon: string;
  /** 该应用可用的 panel 类型列表，为空数组表示全部可用 */
  allowedPanelTypes: string[];
};

/**
 * 默认预置的应用配置（为空，用户自行配置）
 */
export const DEFAULT_APPS: AppConfig[] = [];

/**
 * AppSelector 存储状态
 */
export type AppSelectorStore = {
  /** 当前选择的应用ID */
  currentAppId: string | undefined;
  /** 应用选择器是否打开 */
  isOpen: boolean;
  /** 自定义应用配置列表 */
  customApps: AppConfig[];
};
