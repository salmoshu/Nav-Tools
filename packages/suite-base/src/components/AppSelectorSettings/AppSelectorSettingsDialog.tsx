// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Add20Regular, Delete20Regular, Edit20Regular } from "@fluentui/react-icons";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeStyles } from "tss-react/mui";

import { AppConfig } from "@lichtblick/suite-base/components/AppSelector/types";
import { AppSelectorContext } from "@lichtblick/suite-base/context/AppSelectorContext/AppSelectorContext";
import { usePanelCatalog } from "@lichtblick/suite-base/context/PanelCatalogContext";

import { AppEditor } from "./AppEditor";
import { AppFormData } from "./types";

const useStyles = makeStyles()((theme) => ({
  dialog: {
    "& .MuiDialog-paper": {
      minWidth: 500,
      maxWidth: 700,
    },
  },
  appIcon: {
    fontSize: "1.5rem",
    minWidth: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  appItem: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
  },
  appContent: {
    display: "flex",
    alignItems: "flex-start",
    padding: theme.spacing(1, 2),
    flex: 1,
  },
  panelChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(0.5),
  },
  actions: {
    display: "flex",
    gap: theme.spacing(0.5),
  },
  addButton: {
    marginBottom: theme.spacing(2),
  },
  emptyState: {
    textAlign: "center",
    padding: theme.spacing(4),
    color: theme.palette.text.secondary,
  },
}));

type AppSelectorSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function AppSelectorSettingsDialog(props: AppSelectorSettingsDialogProps): React.JSX.Element {
  const { open, onClose } = props;
  const { classes } = useStyles();
  const { t } = useTranslation("appSelectorSettings");
  const panelCatalog = usePanelCatalog();

  // 获取应用选择器状态
  const appSelectorStore = useContext(AppSelectorContext);
  const customApps = appSelectorStore?.getState().customApps ?? [];

  // 编辑器状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AppConfig | undefined>(undefined);

  // 所有应用
  const allApps = customApps;

  // 现有名称列表（用于验证）
  const existingNames = useMemo(() => {
    return allApps.map((app) => app.name);
  }, [allApps]);

  // 添加应用
  const handleAdd = useCallback(() => {
    setEditingApp(undefined);
    setEditorOpen(true);
  }, []);

  // 编辑应用
  const handleEdit = useCallback((app: AppConfig) => {
    setEditingApp(app);
    setEditorOpen(true);
  }, []);

  // 删除应用
  const handleDelete = useCallback(
    (appId: string) => {
      if (window.confirm(t("confirmDelete"))) {
        const newCustomApps = customApps.filter((app) => app.id !== appId);
        appSelectorStore?.setState({ customApps: newCustomApps });
      }
    },
    [customApps, appSelectorStore, t],
  );

  // 保存应用
  const handleSave = useCallback(
    (formData: AppFormData, originalId?: string) => {
      const newApp: AppConfig = {
        id: formData.id!,
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        allowedPanelTypes: formData.allowedPanelTypes,
      };

      if (editingApp && originalId) {
        // 更新现有应用
        const index = customApps.findIndex((app) => app.id === originalId);
        if (index >= 0) {
          const newCustomApps = [...customApps];
          newCustomApps[index] = newApp;
          appSelectorStore?.setState({ customApps: newCustomApps });
          
          // 如果当前选中的应用被修改了 ID，需要更新 currentAppId
          const currentState = appSelectorStore?.getState();
          if (currentState?.currentAppId === originalId) {
            appSelectorStore?.setState({ currentAppId: newApp.id });
          }
        }
      } else {
        // 添加新应用
        appSelectorStore?.setState({
          customApps: [...customApps, newApp],
        });
      }

      setEditorOpen(false);
    },
    [customApps, appSelectorStore, editingApp],
  );

  // 获取 panel 数量文本
  const getPanelCountText = (app: AppConfig): string => {
    if (app.allowedPanelTypes.length === 0) {
      return t("noPanels");
    }
    return t("panelCount", { count: app.allowedPanelTypes.length });
  };

  // 获取 panel 标题列表
  const getPanelTitles = (app: AppConfig): string[] => {
    if (app.allowedPanelTypes.length === 0) {
      return [];
    }
    const allPanels = panelCatalog.getAllPanels();
    return app.allowedPanelTypes
      .map((type) => {
        const panel = allPanels.find((p) => p.type === type);
        return panel?.title || type;
      })
      .slice(0, 5); // 最多显示5个
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} className={classes.dialog} maxWidth="md" fullWidth>
        <DialogTitle>{t("manageApps")}</DialogTitle>
        <DialogContent>
          {/* 添加按钮 */}
          <Button
            variant="outlined"
            startIcon={<Add20Regular />}
            onClick={handleAdd}
            className={classes.addButton}
          >
            {t("addApp")}
          </Button>

          {/* 应用列表 */}
          <List disablePadding>
            {allApps.map((app) => {
              const panelTitles = getPanelTitles(app);

              return (
                <ListItem
                  key={app.id}
                  className={classes.appItem}
                  disablePadding
                  secondaryAction={
                    <Box className={classes.actions}>
                      <Tooltip title={t("edit")}>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleEdit(app)}
                        >
                          <Edit20Regular />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("delete")}>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDelete(app.id)}
                          color="error"
                        >
                          <Delete20Regular />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                >
                  <Box className={classes.appContent}>
                    <ListItemIcon className={classes.appIcon}>{app.icon}</ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="subtitle1">
                          {app.name}
                        </Typography>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {app.description}
                          </Typography>
                          <Box className={classes.panelChips}>
                            <Chip
                              label={getPanelCountText(app)}
                              size="small"
                              variant="outlined"
                              color="info"
                            />
                            {panelTitles.map((title) => (
                              <Chip key={title} label={title} size="small" />
                            ))}
                            {app.allowedPanelTypes.length > 5 && (
                              <Chip
                                label={t("morePanels", {
                                  count: app.allowedPanelTypes.length - 5,
                                })}
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </Box>
                        </Box>
                      }
                    />
                  </Box>
                </ListItem>
              );
            })}
          </List>

          {allApps.length === 0 && (
            <Box className={classes.emptyState}>
              <Typography>{t("noApps")}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="contained">
            {t("close")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 应用编辑器 */}
      <AppEditor
        open={editorOpen}
        app={editingApp}
        onSave={handleSave}
        onCancel={() => setEditorOpen(false)}
        existingNames={existingNames}
      />
    </>
  );
}
