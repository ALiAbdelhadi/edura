"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useI18n } from "@/components/providers/I18nProvider";

type TourStep = {
  target: string;
  content: string;
  disableBeacon?: boolean;
};

type RoleSteps = Record<string, TourStep[]>;

function buildStepsByRole(t: (key: string) => string): RoleSteps {
  return {
    center_admin: [
      {
        target: '[data-tour="dashboard"]',
        content: t("shared.tourAdminDashboard"),
        disableBeacon: true,
      },
      {
        target: '[data-tour="courses"]',
        content: t("shared.tourAdminCourses"),
      },
      {
        target: '[data-tour="students"]',
        content: t("shared.tourAdminStudents"),
      },
      {
        target: '[data-tour="settings"]',
        content: t("shared.tourAdminSettings"),
      },
    ],
    teacher: [
      {
        target: '[data-tour="my-courses"]',
        content: t("shared.tourTeacherCourses"),
        disableBeacon: true,
      },
      {
        target: '[data-tour="gradebook"]',
        content: t("shared.tourTeacherGradebook"),
      },
      {
        target: '[data-tour="messages"]',
        content: t("shared.tourTeacherMessages"),
      },
    ],
    student: [
      {
        target: '[data-tour="browse-courses"]',
        content: t("shared.tourStudentBrowse"),
        disableBeacon: true,
      },
      {
        target: '[data-tour="my-courses"]',
        content: t("shared.tourStudentCourses"),
      },
      {
        target: '[data-tour="messages"]',
        content: t("shared.tourStudentMessages"),
      },
    ],
    parent: [
      {
        target: '[data-tour="link-child"]',
        content: t("shared.tourParentLink"),
        disableBeacon: true,
      },
      {
        target: '[data-tour="child-courses"]',
        content: t("shared.tourParentCourses"),
      },
      {
        target: '[data-tour="grades"]',
        content: t("shared.tourParentGrades"),
      },
    ],
  };
}

type OnboardingTourProps = {
  role: string;
};

function JoyrideWrapper({
  steps,
  run,
  onDone,
  joyrideLocale,
}: {
  steps: TourStep[];
  run: boolean;
  onDone: () => void;
  joyrideLocale: { back: string; close: string; last: string; next: string; skip: string };
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [JoyrideComponent, setJoyrideComponent] = useState<any>(null);

  useEffect(() => {
    import("react-joyride").then((mod) => {
      setJoyrideComponent(() => mod.Joyride);
    });
  }, []);

  const handleCallback = useCallback((data: { status: string }) => {
    if (data.status === "finished" || data.status === "skipped") {
      onDone();
    }
  }, [onDone]);

  if (!JoyrideComponent) return null;

  return (
    <JoyrideComponent
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      locale={joyrideLocale}
      callback={handleCallback}
      styles={{
        options: {
          primaryColor: "#1677ff",
          zIndex: 10000,
        },
      }}
    />
  );
}

export default function OnboardingTour({ role }: OnboardingTourProps) {
  const { t } = useI18n();
  const [run, setRun] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/me/prefs");
        if (!res.ok) return;
        const { data } = await res.json();
        if (!cancelled && !data?.tourCompleted) {
          setRun(true);
        }
      } catch {
        // silently skip if prefs unavailable
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDone = useCallback(async () => {
    setRun(false);
    try {
      await fetch("/api/v1/me/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourCompleted: true }),
      });
    } catch {
      // non-critical
    }
  }, []);

  const steps = useMemo(() => buildStepsByRole(t)[role] || [], [t, role]);

  const joyrideLocale = useMemo(
    () => ({
      back: t("shared.tourBack"),
      close: t("shared.tourClose"),
      last: t("shared.tourLast"),
      next: t("shared.tourNext"),
      skip: t("shared.tourSkip"),
    }),
    [t],
  );

  if (!loaded || !run || steps.length === 0) return null;

  return <JoyrideWrapper steps={steps} run={run} onDone={handleDone} joyrideLocale={joyrideLocale} />;
}
