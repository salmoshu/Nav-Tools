// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PropsWithChildren, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";

import Panel from "@lichtblick/suite-base/components/Panel";
import { PanelExtensionAdapter } from "@lichtblick/suite-base/components/PanelExtensionAdapter";
import {
  AppConfig,
  DEFAULT_APPS,
} from "@lichtblick/suite-base/components/AppSelector/types";
import { AppSelectorContext } from "@lichtblick/suite-base/context/AppSelectorContext/AppSelectorContext";
import { useExtensionCatalog } from "@lichtblick/suite-base/context/ExtensionCatalogContext";
import PanelCatalogContext, {
  PanelCatalog,
  PanelInfo,
} from "@lichtblick/suite-base/context/PanelCatalogContext";
import * as panels from "@lichtblick/suite-base/panels";
import { SaveConfig } from "@lichtblick/suite-base/types/panels";

type PanelProps = {
  config: unknown;
  saveConfig: SaveConfig<unknown>;
};

/**
 * 根据应用ID获取应用配置
 */
function getAppById(
  appId: string | undefined,
  customApps: AppConfig[],
): AppConfig | undefined {
  if (!appId) {
    return undefined;
  }
  const allApps = [...DEFAULT_APPS, ...customApps];
  return allApps.find((app) => app.id === appId);
}

export default function PanelCatalogProvider(props: PropsWithChildren): React.ReactElement {
  const { t } = useTranslation("panels");

  const extensionPanels = useExtensionCatalog((state) => state.installedPanels);

  // 获取当前选择的应用
  const appSelectorContext = useContext(AppSelectorContext);
  
  // 从 store 中获取当前应用ID和自定义应用
  const currentAppId = appSelectorContext?.getState().currentAppId;
  const customApps = appSelectorContext?.getState().customApps ?? [];

  // 获取当前应用的配置
  const currentAppConfig = useMemo(() => {
    return getAppById(currentAppId, customApps);
  }, [currentAppId, customApps]);

  const wrappedExtensionPanels = useMemo<PanelInfo[]>(() => {
    return Object.values(extensionPanels ?? {}).map((panel) => {
      const panelType = `${panel.extensionName}.${panel.registration.name}`;
      const PanelWrapper = (panelProps: PanelProps) => {
        return (
          <>
            <PanelExtensionAdapter
              config={panelProps.config}
              saveConfig={panelProps.saveConfig}
              initPanel={panel.registration.initPanel}
            />
          </>
        );
      };
      PanelWrapper.panelType = panelType;
      PanelWrapper.defaultConfig = {};
      return {
        category: "misc",
        title: panel.registration.name,
        type: panelType,
        module: async () => ({ default: Panel(PanelWrapper) }),
        extensionNamespace: panel.extensionNamespace,
      };
    });
  }, [extensionPanels]);

  // Re-call the function when the language changes to ensure that the panel's information is successfully translated
  const allPanelsInfo = useMemo(() => {
    return {
      builtin: panels.getBuiltin(t),
    };
  }, [t]);

  const allPanels = useMemo(() => {
    return [...allPanelsInfo.builtin, ...wrappedExtensionPanels];
  }, [wrappedExtensionPanels, allPanelsInfo]);

  // 根据当前应用配置过滤面板
  const visiblePanels = useMemo(() => {
    const panelList = [...allPanelsInfo.builtin];
    panelList.push(...wrappedExtensionPanels);

    // 如果有应用配置且指定了允许的面板类型，则进行过滤
    if (currentAppConfig && currentAppConfig.allowedPanelTypes.length > 0) {
      return panelList.filter((panel) =>
        currentAppConfig.allowedPanelTypes.includes(panel.type),
      );
    }

    return panelList;
  }, [wrappedExtensionPanels, allPanelsInfo, currentAppConfig]);

  const panelsByType = useMemo(() => {
    const byType = new Map<string, PanelInfo>();

    for (const panel of allPanels) {
      const type = panel.type;
      byType.set(type, panel);
    }
    return byType;
  }, [allPanels]);

  const provider = useMemo<PanelCatalog>(() => {
    return {
      getPanels() {
        return visiblePanels;
      },
      getAllPanels() {
        return allPanels;
      },
      getPanelByType(type: string) {
        return panelsByType.get(type);
      },
    };
  }, [panelsByType, visiblePanels, allPanels]);

  return (
    <PanelCatalogContext.Provider value={provider}>{props.children}</PanelCatalogContext.Provider>
  );
}
