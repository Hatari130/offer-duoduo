import type { JobApplication } from "@/shared/types";

export function downloadBackup(jobs: JobApplication[], format: "json" | "csv"): void {
  let content: string;
  let mime: string;

  if (format === "json") {
    content = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), jobs }, null, 2);
    mime = "application/json";
  } else {
    const headers = [
      "id",
      "company",
      "position",
      "jobId",
      "city",
      "stage",
      "deadline",
      "nextAction",
      "sourceUrl",
      "updatedAt"
    ];
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    content = [
      headers.join(","),
      ...jobs.map((job) =>
        headers.map((key) => escape(job[key as keyof JobApplication])).join(",")
      )
    ].join("\n");
    mime = "text/csv;charset=utf-8";
  }

  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `offerflow-backup-${new Date().toISOString().slice(0, 10)}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
