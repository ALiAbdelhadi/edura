"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { PageHeader } from "@/components/kit/page-header";
import { StructureTab } from "./structure-tab";
import { SubjectsTab } from "./subjects-tab";
import { OfferingsTab } from "./offerings-tab";
import { RequestsTab } from "./requests-tab";

export function CatalogAdminScreen() {
  const t = useTranslations();

  return (
    <div className="grid gap-6">
      <PageHeader title={t("catalog.title")} description={t("catalog.subtitle")} />
      <Tabs defaultValue="structure">
        <TabsList>
          <TabsTrigger value="structure">{t("catalog.tabs.structure")}</TabsTrigger>
          <TabsTrigger value="subjects">{t("catalog.tabs.subjects")}</TabsTrigger>
          <TabsTrigger value="offerings">{t("catalog.tabs.offerings")}</TabsTrigger>
          <TabsTrigger value="requests">{t("catalog.tabs.requests")}</TabsTrigger>
        </TabsList>
        <TabsContent value="structure" className="mt-4">
          <StructureTab />
        </TabsContent>
        <TabsContent value="subjects" className="mt-4">
          <SubjectsTab />
        </TabsContent>
        <TabsContent value="offerings" className="mt-4">
          <OfferingsTab />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
