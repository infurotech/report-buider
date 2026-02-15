export class GenerateReportDto {
  template: string;
  content: Record<string, unknown>;
  config?: Record<string, unknown>;
  options?: { paged?: boolean };
}
