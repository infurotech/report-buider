import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';

const MAIN_FILE = 'report.hbs';
const PARTIALS_DIR = 'partials';

@Injectable()
export class TemplateService {
  private readonly templatesBasePath: string;
  private readonly cache = new Map<string, Handlebars.TemplateDelegate>();

  constructor() {
    this.templatesBasePath =
      process.env.TEMPLATES_PATH ?? path.join(process.cwd(), 'templates');
    this.registerDefaultHelpers();
  }

  private registerDefaultHelpers() {
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  }

  async listTemplates(): Promise<string[]> {
    const names: string[] = [];
    try {
      const entries = await fs.readdir(this.templatesBasePath, {
        withFileTypes: true,
      });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const mainPath = path.join(
          this.templatesBasePath,
          e.name,
          MAIN_FILE,
        );
        try {
          await fs.access(mainPath);
          names.push(e.name);
        } catch {
          // no report.hbs, skip
        }
      }
    } catch {
      // no templates dir
    }
    return names.sort();
  }

  private resolveTemplateDir(templateName: string): string {
    if (
      templateName.includes('..') ||
      path.isAbsolute(templateName) ||
      templateName !== path.normalize(templateName)
    ) {
      throw new Error('Invalid template name');
    }
    return path.join(this.templatesBasePath, templateName);
  }

  async getCompiledTemplate(
    templateName: string,
  ): Promise<Handlebars.TemplateDelegate> {
    const cached = this.cache.get(templateName);
    if (cached) return cached;

    const templateDir = this.resolveTemplateDir(templateName);
    const mainPath = path.join(templateDir, MAIN_FILE);
    const partialsPath = path.join(templateDir, PARTIALS_DIR);

    const mainSource = await fs.readFile(mainPath, 'utf-8');
    let partials: Record<string, Handlebars.TemplateDelegate> = {};
    try {
      const partialFiles = await fs.readdir(partialsPath);
      for (const file of partialFiles) {
        if (!file.endsWith('.hbs')) continue;
        const name = path.basename(file, '.hbs');
        const source = await fs.readFile(
          path.join(partialsPath, file),
          'utf-8',
        );
        partials[name] = Handlebars.compile(source);
      }
    } catch {
      // no partials dir or empty
    }

    const compiler = Handlebars.create();
    Object.entries(partials).forEach(([name, fn]) =>
      compiler.registerPartial(name, fn),
    );
    compiler.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    compiler.registerHelper('staticMapUrl', (options: Handlebars.HelperOptions) => {
      const h = options.hash as Record<string, unknown>;
      const key = h?.key as string | undefined;
      if (!key || typeof key !== 'string') return '';
      const center = h.center as string | number[] | undefined;
      const zoom = (h.zoom as number) ?? 12;
      const size = (h.size as string) ?? '600x400';
      const markers = (h.markers as Array<{ lat?: number; lng?: number; label?: string; color?: string }>) ?? [];
      const params = new URLSearchParams();
      params.set('key', key);
      if (center) {
        const c = Array.isArray(center) ? center.join(',') : String(center);
        params.set('center', c);
      }
      params.set('zoom', String(zoom));
      params.set('size', size);
      params.set('maptype', 'roadmap');
      markers.forEach((m) => {
        const lat = m?.lat ?? (m as Record<string, number>)?.latitude;
        const lng = m?.lng ?? (m as Record<string, number>)?.longitude;
        if (lat == null || lng == null) return;
        let mstr = '';
        if (m?.color) mstr += `color:${m.color}|`;
        if (m?.label) mstr += `label:${m.label}|`;
        mstr += `${lat},${lng}`;
        params.append('markers', mstr);
      });
      return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
    });
    compiler.registerHelper('chartImageUrl', (options: Handlebars.HelperOptions) => {
      const h = options.hash as Record<string, unknown>;
      const chart = h?.chart;
      if (!chart || typeof chart !== 'object') return '';
      const config = (h.config as Record<string, unknown>) ?? {};
      const primary = (config.primaryColor as string) || '#2563eb';
      const secondary = (config.secondaryColor as string) || '#64748b';
      let chartStr = JSON.stringify(chart);
      chartStr = chartStr.replace(/"primary"/g, `"${primary}"`).replace(/"secondary"/g, `"${secondary}"`);
      const width = (h.width as number) ?? 680;
      const height = (h.height as number) ?? 340;
      const base = 'https://quickchart.io/chart';
      const params = new URLSearchParams();
      params.set('c', chartStr);
      params.set('width', String(width));
      params.set('height', String(height));
      return `${base}?${params.toString()}`;
    });

    const template = compiler.compile(mainSource);
    this.cache.set(templateName, template);
    return template;
  }
}
