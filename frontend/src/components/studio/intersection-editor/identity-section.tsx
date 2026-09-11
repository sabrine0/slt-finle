"use client";

import { SectionToolbar, StudioInput } from "@/components/studio/intersection-editor/form-controls";
import { useStudioDispatch } from "@/components/studio/state/store";
import type { IntersectionConfig } from "@/components/studio/state/types";

export function IdentitySection({ config }: { config: IntersectionConfig }) {
  const dispatch = useStudioDispatch();

  const patch = (next: Partial<IntersectionConfig["identity"]>) =>
    dispatch({ type: "patchIdentity", intersectionId: config.id, patch: next });

  return (
    <section className="flex flex-col">
      <SectionToolbar
        title="Identity"
        subtitle="Display name, jurisdiction, address, and geographic anchor."
      />

      <div className="grid grid-cols-2 gap-4 px-6 py-5">
        <StudioInput
          label="Code"
          value={config.id}
          onChange={() => undefined}
          disabled
        />
        <StudioInput
          label="Controller ID"
          value={config.controllerId}
          onChange={() => undefined}
          disabled
        />
        <StudioInput
          label="Name"
          value={config.identity.name}
          onChange={(value) => patch({ name: value })}
          className="col-span-2"
        />
        <StudioInput
          label="District"
          value={config.identity.district}
          onChange={(value) => patch({ district: value })}
        />
        <StudioInput
          label="Address"
          value={config.identity.address}
          onChange={(value) => patch({ address: value })}
        />
        <StudioInput
          label="Latitude"
          type="number"
          value={config.identity.location.lat}
          onChange={(value) =>
            patch({
              location: {
                ...config.identity.location,
                lat: Number(value) || 0,
              },
            })
          }
        />
        <StudioInput
          label="Longitude"
          type="number"
          value={config.identity.location.lng}
          onChange={(value) =>
            patch({
              location: {
                ...config.identity.location,
                lng: Number(value) || 0,
              },
            })
          }
        />
      </div>
    </section>
  );
}
