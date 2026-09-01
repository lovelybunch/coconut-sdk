// Space templates: whole-space starting kits in the coco-space-export format
// (built-in catalog, optional remote catalog, org snapshots), listed on the
// app's /templates gallery. Note: creating a space from a template carries
// the same authorization bar as creating a space — org admin.

import { CocoHttp } from "../http.js";
import type {
  CreateSpaceFromTemplateOptions,
  CreateSpaceFromTemplateResult,
  SpaceTemplateDetail,
  SpaceTemplateListResult,
  SpaceTemplateSource,
} from "../types.js";

export class SpaceTemplatesApi {
  constructor(private readonly http: CocoHttp) {}

  /** The merged gallery (catalog + org snapshots). */
  list(options: { includePages?: boolean } = {}): Promise<SpaceTemplateListResult> {
    return this.http.requestJson<SpaceTemplateListResult>("GET", "/space-templates", {
      query: { includePages: options.includePages ? "1" : undefined },
    });
  }

  /** One template in full — every bundle page with content (the preview data). */
  get(source: SpaceTemplateSource, id: string): Promise<SpaceTemplateDetail> {
    return this.http.requestJson<SpaceTemplateDetail>(
      "GET",
      `/space-templates/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Creates a new space seeded from a template — pages, page templates, and
   * agent instructions included. Requires an org-admin principal.
   */
  createSpace(
    source: SpaceTemplateSource,
    id: string,
    options: CreateSpaceFromTemplateOptions,
  ): Promise<CreateSpaceFromTemplateResult> {
    return this.http.requestJson<CreateSpaceFromTemplateResult>(
      "POST",
      `/space-templates/${encodeURIComponent(source)}/${encodeURIComponent(id)}/spaces`,
      { body: options },
    );
  }
}
