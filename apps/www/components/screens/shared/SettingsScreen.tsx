"use client";

import React, { useState, useEffect } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Card, Button, Input, Form, Select, Alert, Space, message, Descriptions } from "antd";
import { UserOutlined, PhoneOutlined, GlobalOutlined, SaveOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

export function SettingsScreen() {
  const { t } = useI18n();
  const { query, result } = useCustom({ url: "me", method: "get" });
  const { mutateAsync: updateMe } = useCustomMutation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const me = result?.data as any;

  useEffect(() => {
    if (me) {
      form.setFieldsValue({
        name: me.name || "",
        phone: me.phone || "",
        locale: me.locale || "ar",
      });
    }
  }, [me, form]);

  const handleSave = async (values: { name: string; phone: string; locale: string }) => {
    setLoading(true);
    setSaved(false);
    try {
      await updateMe({
        url: "me",
        method: "patch",
        values: {
          name: values.name.trim(),
          phone: values.phone?.trim() || undefined,
          locale: values.locale,
        },
      });
      message.success(t("shared.settingsSaved"));
      setSaved(true);
    } catch (err: any) {
      message.error(err?.message || t("shared.settingsSaveFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (query.isLoading) {
    return <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("common.loading")}</div>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 600 }}>
      <Card title={t("shared.settingsProfile")}>
        <Descriptions column={1} size="small" bordered style={{ marginBottom: 24 }}>
          <Descriptions.Item label={t("auth.email")}>{me?.email}</Descriptions.Item>
          <Descriptions.Item label={t("shared.settingsRole")}>
            {me?.role ? (t(`roles.${me.role}`) === `roles.${me.role}` ? me.role.replace("_", " ") : t(`roles.${me.role}`)) : ""}
          </Descriptions.Item>
          <Descriptions.Item label={t("shared.settingsStatus")}>
            {me?.status ? (t(`status.${me.status}`) === `status.${me.status}` ? me.status : t(`status.${me.status}`)) : ""}
          </Descriptions.Item>
        </Descriptions>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{ name: "", phone: "", locale: "ar" }}
        >
          {saved && (
            <Alert message={t("shared.settingsSavedAlert")} type="success" showIcon closable style={{ marginBottom: 16 }} />
          )}

          <Form.Item name="name" label={t("shared.settingsName")} rules={[{ required: true, message: t("shared.settingsNameRequired") }]}>
            <Input prefix={<UserOutlined style={{ color: "#a5a8b5" }} />} placeholder={t("shared.settingsNamePlaceholder")} size="large" />
          </Form.Item>

          <Form.Item name="phone" label={t("shared.settingsPhone")}>
            <Input prefix={<PhoneOutlined style={{ color: "#a5a8b5" }} />} placeholder={t("shared.settingsPhonePlaceholder")} size="large" />
          </Form.Item>

          <Form.Item name="locale" label={t("shared.settingsLanguage")}>
            <Select
              size="large"
              options={[
                { value: "ar", label: "العربية (Arabic)" },
                { value: "en", label: "English" },
              ]}
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />} size="large">
            {t("shared.settingsSaveChanges")}
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
