// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeStyles } from "tss-react/mui";

import { AppConfig } from "@lichtblick/suite-base/components/AppSelector/types";
import { usePanelCatalog } from "@lichtblick/suite-base/context/PanelCatalogContext";

import { AppFormData, PanelOption } from "./types";

// 常用图标列表
const COMMON_ICONS = [
  "📊", "📈", "📉", "📱", "💻", "🖥️", "⚙️", "🔧", "🔨", "🛠️",
  "📡", "🛰️", "🚀", "✈️", "🚁", "🚗", "🚕", "🚙", "🚌", "🚎",
  "🏠", "🏢", "🏭", "🏥", "🏫", "🏪", "🌐", "🌍", "🌎", "🌏",
  "☀️", "🌙", "⭐", "☁️", "⚡", "🔥", "❄️", "🌊", "🌲", "🌿",
  "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "⬛",
  "📦", "📋", "📄", "📑", "📂", "📁", "📚", "📖", "🔍", "🔎",
  "🔒", "🔓", "🔑", "🗝️", "⚠️", "⛔", "🚫", "✅", "❌", "❓",
  "💡", "🔦", "🕯️", "💰", "💵", "💎", "🏆", "🥇", "🥈", "🥉",
];

const useStyles = makeStyles()((theme) => ({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
  },
  iconPreview: {
    fontSize: "2rem",
    textAlign: "center",
    padding: theme.spacing(1),
    border: `1px dashed ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    minWidth: 60,
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  iconGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(10, 1fr)",
    gap: theme.spacing(0.5),
    padding: theme.spacing(1),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    maxHeight: 120,
    overflowY: "auto",
  },
  iconItem: {
    fontSize: "1.5rem",
    padding: theme.spacing(0.5),
    textAlign: "center",
    cursor: "pointer",
    borderRadius: theme.shape.borderRadius,
    transition: "background-color 0.2s ease",
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
  },
  iconSelected: {
    backgroundColor: theme.palette.primary.main,
    "&:hover": {
      backgroundColor: theme.palette.primary.dark,
    },
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 0.5,
  },
  panelSelect: {
    minWidth: 200,
  },
}));

type AppEditorProps = {
  open: boolean;
  app?: AppConfig;
  onSave: (app: AppFormData, originalId?: string) => void;
  onCancel: () => void;
  existingNames: string[];
};

export function AppEditor(props: AppEditorProps): React.JSX.Element {
  const { open, app, onSave, onCancel, existingNames } = props;
  const { classes, cx } = useStyles();
  const { t } = useTranslation("appSelectorSettings");
  const panelCatalog = usePanelCatalog();

  const isEditing = !!app;

  // 获取所有可用的 panel 选项（使用 getAllPanels 获取未过滤的面板列表）
  const panelOptions: PanelOption[] = useMemo(() => {
    const panels = panelCatalog.getAllPanels();
    return panels.map((panel) => ({
      type: panel.type,
      title: panel.title,
      description: panel.description,
    }));
  }, [panelCatalog]);

  // 表单状态
  const [formData, setFormData] = useState<AppFormData>({
    name: "",
    description: "",
    icon: "📱",
    allowedPanelTypes: [],
  });

  const [errors, setErrors] = useState<Partial<Record<keyof AppFormData, string>>>({});

  // 重置表单数据
  useEffect(() => {
    if (open) {
      if (app) {
        setFormData({
          name: app.name,
          description: app.description,
          icon: app.icon,
          allowedPanelTypes: [...app.allowedPanelTypes],
        });
      } else {
        setFormData({
          name: "",
          description: "",
          icon: "📱",
          allowedPanelTypes: [],
        });
      }
      setErrors({});
    }
  }, [open, app]);

  // 生成应用 ID（从名称转换）
  const generateAppId = useCallback((name: string): string => {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-") // 非字母数字中文字符替换为 -
      .replace(/^-+|-+$/g, ""); // 移除开头和结尾的 -
  }, []);

  // 验证表单
  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof AppFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = t("nameRequired");
    } else if (!isEditing && existingNames.includes(formData.name.trim())) {
      newErrors.name = t("nameExists");
    }

    if (!formData.icon.trim()) {
      newErrors.icon = t("iconRequired");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, isEditing, existingNames, t]);

  // 保存
  const handleSave = useCallback(() => {
    if (validate()) {
      const appId = generateAppId(formData.name);
      onSave({ ...formData, id: appId }, app?.id);
    }
  }, [formData, onSave, validate, generateAppId, app]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePanelChange = useCallback((event: any) => {
    const value = event.target.value as string[];
    setFormData((prev) => ({
      ...prev,
      allowedPanelTypes: value,
    }));
  }, []);

  // 处理输入变化
  const handleChange = useCallback(
    (field: keyof AppFormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
      // 清除该字段的错误
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors],
  );

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditing ? t("editApp") : t("addApp")}</DialogTitle>
      <DialogContent>
        <Box className={classes.form} sx={{ mt: 1 }}>
          {/* 名称 */}
          <TextField
            label={t("appName")}
            value={formData.name}
            onChange={handleChange("name")}
            error={!!errors.name}
            helperText={errors.name}
            fullWidth
            size="small"
            autoFocus
          />

          {/* 描述 */}
          <TextField
            label={t("appDescription")}
            value={formData.description}
            onChange={handleChange("description")}
            multiline
            rows={2}
            fullWidth
            size="small"
          />

          {/* 图标选择器 */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t("appIcon")}
            </Typography>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid size={{ xs: 12 }}>
                <Box className={classes.iconGrid}>
                  {COMMON_ICONS.map((icon) => (
                    <Box
                      key={icon}
                      className={cx(classes.iconItem, {
                        [classes.iconSelected]: formData.icon === icon,
                      })}
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, icon }))
                      }
                    >
                      {icon}
                    </Box>
                  ))}
                </Box>
              </Grid>
              <Grid size={{ xs: 10 }}>
                <TextField
                  label={t("customIcon")}
                  value={formData.icon}
                  onChange={handleChange("icon")}
                  error={!!errors.icon}
                  helperText={errors.icon || t("appIconHelp")}
                  fullWidth
                  size="small"
                  placeholder="📱"
                />
              </Grid>
              <Grid size={{ xs: 2 }}>
                <Box className={classes.iconPreview}>{formData.icon}</Box>
              </Grid>
            </Grid>
          </Box>

          {/* Panel 选择 */}
          <FormControl fullWidth size="small">
            <InputLabel id="panels-select-label">{t("allowedPanels")}</InputLabel>
            <Select
              labelId="panels-select-label"
              multiple
              value={formData.allowedPanelTypes}
              onChange={handlePanelChange}
              input={<OutlinedInput label={t("allowedPanels")} />}
              renderValue={(selected) => (
                <Box className={classes.chips}>
                  {(selected as string[]).map((value) => {
                    const panel = panelOptions.find((p) => p.type === value);
                    return <Chip key={value} label={panel?.title || value} size="small" />;
                  })}
                </Box>
              )}
              className={classes.panelSelect}
            >
              {panelOptions.map((panel) => (
                <MenuItem key={panel.type} value={panel.type}>
                  <Box>
                    <Typography variant="body2">{panel.title}</Typography>
                    {panel.description && (
                      <Typography variant="caption" color="text.secondary">
                        {panel.description}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {t("allowedPanelsHelp")}
            </FormHelperText>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("cancel")}</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {t("save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
