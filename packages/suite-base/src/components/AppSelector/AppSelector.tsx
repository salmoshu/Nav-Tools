// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Add20Regular, Settings20Regular } from "@fluentui/react-icons";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeStyles } from "tss-react/mui";

import { AppConfig, DEFAULT_APPS } from "./types";
import { AppSelectorSettingsDialog } from "@lichtblick/suite-base/components/AppSelectorSettings";

const useStyles = makeStyles()((theme) => ({
  dialog: {
    "& .MuiDialog-paper": {
      minWidth: 600,
      maxWidth: 800,
    },
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing(1),
  },
  appCard: {
    height: "100%",
    transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
    "&:hover": {
      transform: "translateY(-4px)",
      boxShadow: theme.shadows[4],
    },
  },
  appCardSelected: {
    border: `2px solid ${theme.palette.primary.main}`,
    backgroundColor: theme.palette.action.selected,
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
  footer: {
    marginTop: theme.spacing(3),
    textAlign: "center",
    display: "flex",
    justifyContent: "center",
    gap: theme.spacing(2),
  },
  settingsButton: {
    position: "absolute",
    top: theme.spacing(1),
    right: theme.spacing(1),
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
}));

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
  const [selectedAppId, setSelectedAppId] = useState<string | undefined>(currentAppId);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 合并默认应用和自定义应用
  const allApps = useMemo(() => {
    return [...DEFAULT_APPS, ...customApps];
  }, [customApps]);

  const hasApps = allApps.length > 0;

  const handleAppClick = useCallback((appId: string) => {
    setSelectedAppId(appId);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedAppId) {
      onSelectApp(selectedAppId);
    }
  }, [selectedAppId, onSelectApp]);

  const handleCancel = useCallback(() => {
    onClose();
    // 重置为当前选择的应用
    setSelectedAppId(currentAppId);
  }, [onClose, currentAppId]);

  const getPanelCountText = (app: AppConfig): string => {
    if (app.allowedPanelTypes.length === 0) {
      return t("allPanelsAvailable");
    }
    return t("panelCount", { count: app.allowedPanelTypes.length });
  };

  return (
    <>
      <Dialog open={open} onClose={handleCancel} className={classes.dialog} maxWidth="md">
        <DialogTitle>
          <Box className={classes.header}>
            <Box flex={1}>
              <Typography variant="h5" component="div" align="center" gutterBottom>
                {t("selectApp")}
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                {hasApps ? t("selectAppDescription") : t("noAppsDescription")}
              </Typography>
            </Box>
            <Tooltip title={t("manageApps")}>
              <IconButton
                className={classes.settingsButton}
                onClick={() => setSettingsOpen(true)}
                size="small"
              >
                <Settings20Regular />
              </IconButton>
            </Tooltip>
          </Box>
        </DialogTitle>
        <DialogContent>
          {hasApps ? (
            <Grid container spacing={2}>
              {allApps.map((app) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={app.id}>
                  <Card
                    className={cx(classes.appCard, {
                      [classes.appCardSelected]: selectedAppId === app.id,
                    })}
                  >
                    <CardActionArea onClick={() => handleAppClick(app.id)}>
                      <CardContent>
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
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Box className={classes.emptyState}>
              <div className={classes.emptyStateIcon}>📱</div>
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
                onClick={() => setSettingsOpen(true)}
              >
                {t("createFirstApp")}
              </Button>
            </Box>
          )}

          {hasApps && (
            <Box className={classes.footer}>
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={handleConfirm}
                disabled={!selectedAppId}
                sx={{ minWidth: 120 }}
              >
                {t("enterApp")}
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* 应用配置对话框 */}
      <AppSelectorSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
