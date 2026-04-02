// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  Add20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Edit20Regular,
  Grid20Regular,
  List20Regular,
} from "@fluentui/react-icons";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeStyles } from "tss-react/mui";

import { AppConfig, DEFAULT_APPS } from "./types";
import { AppSelectorSettingsDialog } from "@lichtblick/suite-base/components/AppSelectorSettings";
import { AppEditor } from "@lichtblick/suite-base/components/AppSelectorSettings/AppEditor";
import { AppSelectorContext } from "@lichtblick/suite-base/context/AppSelectorContext/AppSelectorContext";
import { usePanelCatalog } from "@lichtblick/suite-base/context/PanelCatalogContext";

const useStyles = makeStyles()((theme) => ({
  dialog: {
    "& .MuiDialog-paper": {
      minWidth: 700,
      maxWidth: 900,
    },
  },
  dialogTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: theme.typography.h3.fontSize,
  },

  headerActions: {
    display: "flex",
    gap: theme.spacing(1.5),
    alignItems: "center",
  },

  closeButton: {
    color: theme.palette.text.secondary,
    "&:hover": {
      color: theme.palette.text.primary,
      backgroundColor: theme.palette.action.hover,
    },
  },
  gridContainer: {
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
  },
  appCard: {
    height: "100%",
    transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out, opacity 0.2s ease",
    position: "relative",
    cursor: "grab",
    "&:hover": {
      transform: "translateY(-4px)",
      boxShadow: theme.shadows[4],
    },
    "&:active": {
      cursor: "grabbing",
    },
  },
  appCardDragging: {
    opacity: 0.5,
  },
  appCardDragOver: {
    border: `2px dashed ${theme.palette.primary.main}`,
    backgroundColor: theme.palette.action.hover,
  },
  appCardSelected: {
    border: `2px solid ${theme.palette.primary.main}`,
    backgroundColor: theme.palette.action.selected,
  },
  appCardActions: {
    position: "absolute",
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
    display: "flex",
    gap: theme.spacing(0.5),
    zIndex: 10,
  },
  addCard: {
    height: "100%",
    minHeight: 180,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    border: `2px dashed ${theme.palette.divider}`,
    cursor: "pointer",
    transition: "all 0.2s ease",
    "&:hover": {
      borderColor: theme.palette.primary.main,
      backgroundColor: theme.palette.action.hover,
    },
  },
  iconContainer: {
    fontSize: "3rem",
    marginBottom: theme.spacing(1),
    textAlign: "center",
  },
  appName: {
    fontWeight: 600,
    textAlign: "center",
    marginBottom: theme.spacing(0.5),
  },
  appDescription: {
    textAlign: "center",
    color: theme.palette.text.secondary,
    fontSize: "0.875rem",
  },
  panelCount: {
    textAlign: "center",
    marginTop: theme.spacing(1),
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
  },
  emptyState: {
    textAlign: "center",
    padding: theme.spacing(6),
    color: theme.palette.text.secondary,
  },
  emptyStateIcon: {
    fontSize: "4rem",
    marginBottom: theme.spacing(2),
  },
  // 列表视图样式
  listContainer: {
    padding: theme.spacing(1, 0),
  },
  listItem: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
    cursor: "grab",
    transition: "opacity 0.2s ease, background-color 0.2s ease",
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
    "&:active": {
      cursor: "grabbing",
    },
  },
  listItemDragging: {
    opacity: 0.3,
  },
  listItemDragOver: {
    border: `2px dashed ${theme.palette.primary.main}`,
    backgroundColor: theme.palette.action.hover,
  },
  listItemSelected: {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.action.selected,
  },
  listItemContent: {
    display: "flex",
    alignItems: "flex-start",
    padding: theme.spacing(1, 2),
    flex: 1,
  },
  listItemIcon: {
    fontSize: "1.5rem",
    minWidth: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  panelChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(0.5),
  },
  listItemActions: {
    display: "flex",
    gap: theme.spacing(0.5),
  },
}));

type ViewMode = "grid" | "list";

type AppSelectorProps = {
  open: boolean;
  currentAppId: string | undefined;
  customApps: AppConfig[];
  onSelectApp: (appId: string) => void;
  onClose: () => void;
};

export function AppSelector(props: AppSelectorProps): React.JSX.Element {
  const { open, currentAppId, customApps, onSelectApp, onClose } = props;
  const { classes, cx } = useStyles();
  const { t } = useTranslation("appSelector");
  const { t: tSettings } = useTranslation("appSelectorSettings");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AppConfig | undefined>(undefined);
  const [highlightedAppId, setHighlightedAppId] = useState<string | undefined>(currentAppId);
  const [draggedAppId, setDraggedAppId] = useState<string | undefined>(undefined);
  const [dragOverAppId, setDragOverAppId] = useState<string | undefined>(undefined);
  const dragStateRef = useRef<{
    isDragging: boolean;
    dragAppId: string | undefined;
    dragIndex: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
    cleanupListeners: (() => void) | undefined;
  }>({
    isDragging: false,
    dragAppId: undefined,
    dragIndex: -1,
    startX: 0,
    startY: 0,
    hasMoved: false,
    cleanupListeners: undefined,
  });

  const DRAG_THRESHOLD = 1; // 拖拽触发阈值（像素）
  
  // 使用 ref 存储处理函数，避免闭包问题
  const handlersRef = useRef<{
    handleMouseMove: ((e: MouseEvent) => void) | null;
    handleMouseUp: (() => void) | null;
  }>({
    handleMouseMove: null,
    handleMouseUp: null,
  });
  
  const panelCatalog = usePanelCatalog();

  const appSelectorStore = useContext(AppSelectorContext);

  // 本地排序状态，用于立即响应拖拽
  const [localApps, setLocalApps] = useState<AppConfig[]>(customApps);
  
  // 使用 ref 存储最新的 localApps，确保拖拽事件中获取最新状态
  const localAppsRef = useRef<AppConfig[]>(customApps);
  useEffect(() => {
    localAppsRef.current = localApps;
  }, [localApps]);
  
  // 当 customApps 变化时更新本地状态
  useEffect(() => {
    setLocalApps(customApps);
    localAppsRef.current = customApps;
  }, [customApps]);

  // 合并默认应用和自定义应用
  const allApps = useMemo(() => {
    return [...DEFAULT_APPS, ...localApps];
  }, [localApps]);

  const hasApps = allApps.length > 0;

  const handleAppClick = useCallback((appId: string) => {
    setHighlightedAppId(appId);
  }, []);

  // 拖拽排序处理
  // 交换两个应用的位置（使用 ref 获取最新状态）
  const swapApps = useCallback((indexA: number, indexB: number) => {
    if (indexA === indexB) return;
    
    const currentApps = localAppsRef.current;
    const newApps = [...currentApps];
    const temp = newApps[indexA];
    if (!temp) return;
    
    // 交换两个元素
    newApps[indexA] = newApps[indexB]!;
    newApps[indexB] = temp;
    
    // 先更新本地状态（立即响应）
    setLocalApps(newApps);
    localAppsRef.current = newApps;
    
    // 再更新 store（持久化）
    appSelectorStore?.setState({ customApps: newApps });
  }, [appSelectorStore]);

  // 开始拖拽
  const startDrag = useCallback((appId: string) => {
    // 使用 ref 获取最新的应用列表
    const currentApps = localAppsRef.current;
    
    // 获取在自定义应用列表中的索引
    const customIndex = currentApps.findIndex((app) => app.id === appId);
    if (customIndex === -1) return;
    
    dragStateRef.current.isDragging = true;
    dragStateRef.current.dragAppId = appId;
    dragStateRef.current.dragIndex = customIndex;
    
    setDraggedAppId(appId);
    
    // 阻止文本选择
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }, []);

  // 处理鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent, appId: string) => {
    // 判断是否为默认应用（默认应用不支持排序）
    const isDefaultApp = DEFAULT_APPS.some((app) => app.id === appId);
    if (isDefaultApp) {
      return;
    }
    
    // 记录起始位置
    dragStateRef.current.startX = e.clientX;
    dragStateRef.current.startY = e.clientY;
    dragStateRef.current.hasMoved = false;
    dragStateRef.current.dragAppId = appId;
    
    // 添加全局鼠标事件监听，使用 wrapper 函数确保调用最新的处理函数
    const moveHandler = (evt: MouseEvent) => handlersRef.current.handleMouseMove?.(evt);
    const upHandler = () => handlersRef.current.handleMouseUp?.();
    
    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("mouseup", upHandler);
    
    // 存储清理函数到 ref，方便后续移除监听
    dragStateRef.current.cleanupListeners = () => {
      document.removeEventListener("mousemove", moveHandler);
      document.removeEventListener("mouseup", upHandler);
    };
  }, []);

  // 处理鼠标抬起
  const handleMouseUpLocal = useCallback((_e: React.MouseEvent, appId: string) => {
    const state = dragStateRef.current;
    
    // 如果没有移动过，则触发点击事件
    if (!state.hasMoved && !state.isDragging) {
      handleAppClick(appId);
    }
  }, []);

  // 处理拖拽移动
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = dragStateRef.current;
    
    // 计算移动距离
    const deltaX = Math.abs(e.clientX - state.startX);
    const deltaY = Math.abs(e.clientY - state.startY);
    
    // 如果还没有开始拖拽，检查是否超过阈值
    if (!state.isDragging) {
      if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
        state.hasMoved = true;
        if (state.dragAppId) {
          startDrag(state.dragAppId);
        }
      }
      // 如果还没超过阈值，不处理
      if (!state.isDragging) return;
    }
    
    // 清除之前的高亮
    setDragOverAppId(undefined);
    
    // 获取鼠标位置下的元素
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    if (!elementBelow) return;
    
    // 查找最近的列表项
    const listItem = elementBelow.closest('[data-app-id]');
    if (!listItem) return;
    
    const targetAppId = listItem.getAttribute('data-app-id');
    if (!targetAppId || targetAppId === state.dragAppId) return;
    
    // 判断目标是否为默认应用
    const isTargetDefault = DEFAULT_APPS.some((app) => app.id === targetAppId);
    if (isTargetDefault) return;
    
    // 使用 ref 获取最新的应用列表
    const currentApps = localAppsRef.current;
    
    // 获取目标在自定义应用列表中的索引
    const targetIndex = currentApps.findIndex((app) => app.id === targetAppId);
    if (targetIndex === -1) return;
    
    // 获取被拖拽元素在当前列表中的实时索引
    const currentDragIndex = currentApps.findIndex((app) => app.id === state.dragAppId);
    if (currentDragIndex === -1 || currentDragIndex === targetIndex) return;
    
    // 执行交换
    swapApps(currentDragIndex, targetIndex);
    
    setDragOverAppId(targetAppId);
  }, [swapApps, startDrag]);
  
  // 更新 handlersRef
  useEffect(() => {
    handlersRef.current.handleMouseMove = handleMouseMove;
  }, [handleMouseMove]);

  // 结束拖拽（全局）
  const handleMouseUp = useCallback(() => {
    const state = dragStateRef.current;
    
    // 重置拖拽状态
    state.isDragging = false;
    state.dragAppId = undefined;
    state.dragIndex = -1;
    state.hasMoved = false;
    
    setDraggedAppId(undefined);
    setDragOverAppId(undefined);
    
    // 使用存储的清理函数移除事件监听
    state.cleanupListeners?.();
    state.cleanupListeners = undefined;
    
    // 恢复文本选择
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);
  
  // 更新 handlersRef
  useEffect(() => {
    handlersRef.current.handleMouseUp = handleMouseUp;
  }, [handleMouseUp]);

  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    // 如果正在拖拽，不处理；如果只是按下还没移动，取消拖拽准备状态
    const state = dragStateRef.current;
    if (!state.isDragging) {
      state.dragAppId = undefined;
    }
  }, []);

  const handleAppDoubleClick = useCallback(
    (appId: string) => {
      onSelectApp(appId);
    },
    [onSelectApp]
  );

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleViewModeChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
      if (newMode) {
        setViewMode(newMode);
      }
    },
    []
  );

  const handleAddApp = useCallback(() => {
    setEditingApp(undefined);
    setEditorOpen(true);
  }, []);

  const handleEditApp = useCallback(
    (e: React.MouseEvent, app: AppConfig) => {
      e.stopPropagation();
      setEditingApp(app);
      setEditorOpen(true);
    },
    []
  );

  const handleDeleteApp = useCallback(
    (e: React.MouseEvent, appId: string) => {
      e.stopPropagation();
      if (window.confirm(tSettings("confirmDelete"))) {
        const newCustomApps = customApps.filter((app) => app.id !== appId);
        appSelectorStore?.setState({ customApps: newCustomApps });

        // 如果删除的是当前选中的应用，清除 currentAppId
        if (appSelectorStore?.getState().currentAppId === appId) {
          appSelectorStore?.setState({ currentAppId: undefined });
        }
      }
    },
    [customApps, appSelectorStore, tSettings]
  );

  const getPanelCountText = (app: AppConfig): string => {
    if (app.allowedPanelTypes.length === 0) {
      return t("allPanelsAvailable");
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
      .slice(0, 5);
  };

  // 渲染卡片视图
  const renderGridView = () => (
    <Grid container spacing={2} className={classes.gridContainer}>
      {/* 添加应用卡片 */}
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <Box className={classes.addCard} onClick={handleAddApp}>
          <Add20Regular style={{ fontSize: "2.5rem", marginBottom: 8 }} />
          <Typography variant="subtitle1">{tSettings("addApp")}</Typography>
        </Box>
      </Grid>
      {allApps.map((app) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={app.id}>
          <Card
            className={cx(classes.appCard, {
              [classes.appCardSelected]: highlightedAppId === app.id,
            })}
          >
            <Box className={classes.appCardActions}>
              <Tooltip title={tSettings("edit")}>
                <IconButton
                  size="small"
                  onClick={(e) => handleEditApp(e, app)}
                >
                  <Edit20Regular />
                </IconButton>
              </Tooltip>
              <Tooltip title={tSettings("delete")}>
                <IconButton
                  size="small"
                  onClick={(e) => handleDeleteApp(e, app.id)}
                  color="error"
                >
                  <Delete20Regular />
                </IconButton>
              </Tooltip>
            </Box>
            <CardActionArea 
              onClick={() => handleAppClick(app.id)}
              onDoubleClick={() => handleAppDoubleClick(app.id)}
            >
              <Box sx={{ p: 2, pt: 4 }}>
                <div className={classes.iconContainer}>{app.icon}</div>
                <Typography variant="h6" className={classes.appName}>
                  {app.name}
                </Typography>
                <Typography variant="body2" className={classes.appDescription}>
                  {app.description}
                </Typography>
                <Typography variant="caption" className={classes.panelCount}>
                  {getPanelCountText(app)}
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  // 渲染列表视图
  const renderListView = () => (
    <List className={classes.listContainer}>
      {/* 添加应用按钮 */}
      <ListItem
        className={classes.listItem}
        disablePadding
        onClick={handleAddApp}
        sx={{ 
          borderStyle: "dashed",
          cursor: "pointer",
          justifyContent: "center",
          py: 1.5,
          "&:hover": {
            borderColor: "primary.main",
            backgroundColor: "action.hover",
          }
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Add20Regular />
          <Typography variant="subtitle1">{tSettings("addApp")}</Typography>
        </Box>
      </ListItem>
      {allApps.map((app) => {
        const panelTitles = getPanelTitles(app);
        const isDragging = draggedAppId === app.id;
        const isDragOver = dragOverAppId === app.id && draggedAppId !== app.id;
        const isSelected = highlightedAppId === app.id;
        const isDefaultApp = DEFAULT_APPS.some((a) => a.id === app.id);
        
        return (
          <Box
            key={app.id}
            data-app-id={app.id}
            className={cx(classes.listItem, {
              [classes.listItemSelected]: isSelected,
              [classes.listItemDragging]: isDragging,
              [classes.listItemDragOver]: isDragOver,
            })}
            onMouseDown={isDefaultApp ? undefined : (e) => handleMouseDown(e, app.id)}
            onMouseUp={(e) => handleMouseUpLocal(e, app.id)}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={() => handleAppDoubleClick(app.id)}
            sx={{
              cursor: isDragging ? "grabbing" : isDefaultApp ? "pointer" : "grab",
              userSelect: "none",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", py: 1, px: 2 }}>
                  <ListItemIcon className={classes.listItemIcon}>{app.icon}</ListItemIcon>
                  <ListItemText
                    primary={<Typography variant="subtitle1">{app.name}</Typography>}
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
                              label={tSettings("morePanels", {
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
              </Box>
              <Box className={classes.listItemActions} sx={{ px: 1 }}>
                <Tooltip title={tSettings("edit")}>
                  <IconButton size="small" onClick={(e) => handleEditApp(e, app)}>
                    <Edit20Regular />
                  </IconButton>
                </Tooltip>
                <Tooltip title={tSettings("delete")}>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDeleteApp(e, app.id)}
                    color="error"
                  >
                    <Delete20Regular />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </Box>
        );
      })}
    </List>
  );

  // 获取现有名称列表（用于验证）
  const existingNames = useMemo(() => {
    return allApps.map((app) => app.name);
  }, [allApps]);

  // 保存应用
  const handleSaveApp = useCallback(
    (formData: { name: string; description: string; icon: string; allowedPanelTypes: string[]; id?: string }, originalId?: string) => {
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
          if (appSelectorStore?.getState().currentAppId === originalId) {
            appSelectorStore?.setState({ currentAppId: newApp.id });
          }
        }
      } else {
        // 添加新应用到列表开头
        appSelectorStore?.setState({
          customApps: [newApp, ...customApps],
        });
      }

      setEditorOpen(false);
    },
    [customApps, appSelectorStore, editingApp]
  );

  return (
    <>
      <Dialog open={open} onClose={handleCancel} className={classes.dialog} maxWidth="md">
        <DialogTitle className={classes.dialogTitle}>
            {t("selectApp")}
            <Box className={classes.headerActions}>
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={handleViewModeChange}
                size="small"
                color="primary"
              >
                <ToggleButton value="grid" aria-label="grid view">
                  <Grid20Regular />
                </ToggleButton>
                <ToggleButton value="list" aria-label="list view">
                  <List20Regular />
                </ToggleButton>
              </ToggleButtonGroup>
              <Tooltip title={t("close")}>
                <IconButton 
                  onClick={handleCancel} 
                  size="small"
                  className={classes.closeButton}
                >
                  <Dismiss20Regular />
                </IconButton>
              </Tooltip>
            </Box>
        </DialogTitle>
        <DialogContent>
          {hasApps ? (
            viewMode === "grid" ? renderGridView() : renderListView()
          ) : (
            <Box className={classes.emptyState}>
              <div className={classes.emptyStateIcon}>🤖</div>
              <Typography variant="h6" gutterBottom>
                {t("noAppsYet")}
              </Typography>
              <Typography variant="body2" paragraph>
                {t("createAppPrompt")}
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Add20Regular />}
                onClick={handleAddApp}
              >
                {t("createFirstApp")}
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* 应用配置对话框 */}
      <AppSelectorSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* 应用编辑器 */}
      <AppEditor
        open={editorOpen}
        app={editingApp}
        onSave={handleSaveApp}
        onCancel={() => setEditorOpen(false)}
        existingNames={existingNames}
      />
    </>
  );
}
