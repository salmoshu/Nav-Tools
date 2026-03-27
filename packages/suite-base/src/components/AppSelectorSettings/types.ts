// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/**
 * 应用编辑表单数据
 */
export type AppFormData = {
  /** 应用 ID（从名称自动生成） */
  id?: string;
  name: string;
  description: string;
  icon: string;
  allowedPanelTypes: string[];
};

/**
 * 可用 panel 选项
 */
export type PanelOption = {
  type: string;
  title: string;
  description?: string;
};
