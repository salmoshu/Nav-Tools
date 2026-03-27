// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { MosaicNode } from "react-mosaic-component";

import { LayoutData } from "@lichtblick/suite-base/context/CurrentLayoutContext/actions";
import { PanelConfig } from "@lichtblick/suite-base/types/panels";
import { getPanelTypeFromId } from "@lichtblick/suite-base/util/layout";

/**
 * 从 MosaicNode 中提取所有的 panel ID
 */
function extractPanelIds(node: MosaicNode<string> | undefined): string[] {
  if (node == undefined) {
    return [];
  }
  if (typeof node === "string") {
    return [node];
  }
  return [...extractPanelIds(node.first), ...extractPanelIds(node.second)];
}

/**
 * 从 MosaicNode 中移除指定的 panel IDs
 */
function removePanelsFromNode(
  node: MosaicNode<string> | undefined,
  panelIdsToRemove: Set<string>,
): MosaicNode<string> | undefined {
  if (node == undefined) {
    return undefined;
  }

  if (typeof node === "string") {
    return panelIdsToRemove.has(node) ? undefined : node;
  }

  const first = removePanelsFromNode(node.first, panelIdsToRemove);
  const second = removePanelsFromNode(node.second, panelIdsToRemove);

  // 如果两个子节点都被移除了，返回 undefined
  if (first == undefined && second == undefined) {
    return undefined;
  }

  // 如果只有一个子节点剩下，返回那个子节点
  if (first == undefined) {
    return second;
  }
  if (second == undefined) {
    return first;
  }

  // 两个子节点都在，返回新的节点
  return {
    ...node,
    first,
    second,
  };
}

/**
 * 根据允许的面板类型过滤布局
 * @param layoutData 原始布局数据
 * @param allowedPanelTypes 允许的面板类型列表，为空数组表示允许所有
 * @returns 过滤后的布局数据
 */
export function filterLayoutByAllowedPanels(
  layoutData: LayoutData | undefined,
  allowedPanelTypes: string[],
): LayoutData | undefined {
  if (layoutData == undefined) {
    return undefined;
  }

  // 如果允许所有面板（空数组），直接返回原布局
  if (allowedPanelTypes.length === 0) {
    return layoutData;
  }

  const allowedTypesSet = new Set(allowedPanelTypes);

  // 找出需要移除的 panel IDs
  const allPanelIds = extractPanelIds(layoutData.layout);
  const panelIdsToRemove = new Set(
    allPanelIds.filter((id) => {
      const type = getPanelTypeFromId(id);
      return !allowedTypesSet.has(type);
    }),
  );

  // 如果没有需要移除的 panel，直接返回原布局
  if (panelIdsToRemove.size === 0) {
    return layoutData;
  }

  // 创建新的布局
  const newLayout = removePanelsFromNode(layoutData.layout, panelIdsToRemove);

  // 创建新的 configById，移除不需要的 panel 配置
  const newConfigById: Record<string, PanelConfig> = {};
  for (const [id, config] of Object.entries(layoutData.configById)) {
    if (!panelIdsToRemove.has(id)) {
      newConfigById[id] = config as PanelConfig;
    }
  }

  return {
    ...layoutData,
    layout: newLayout,
    configById: newConfigById,
  };
}
