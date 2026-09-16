from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

from app_demo.artifacts import load_blueprint, load_brief
from app_demo.config import resolve_demo_config
from app_demo.demo_accounts import seed_demo_accounts
from app_demo.import_merge import run_import_merge
from app_demo.org_config import apply_org_toggles
from app_demo.scenario_packs import run_pack
from app_demo.script_generator import generate_demo_script
from app_demo.structure_seed import seed_structure
from app_demo.tenant_provision import ensure_demo_tenant


def provision_demo(
    *,
    blueprint_id: str,
    brief_path: Path,
    reset: bool = False,
    dry_run: bool = False,
    skip_import: bool = False,
) -> dict[str, Any]:
    blueprint = load_blueprint(blueprint_id)
    brief = load_brief(brief_path)
    brief_niche = brief.get("niche")
    if brief_niche and brief_niche != blueprint["id"]:
        raise ValueError(f"Brief niche {brief_niche} != blueprint {blueprint['id']}")

    config = resolve_demo_config(blueprint, brief)
    if dry_run:
        return {
            "dry_run": True,
            "blueprint_id": blueprint_id,
            "brief_path": str(brief_path),
            "config": asdict(config),
        }

    org = ensure_demo_tenant(config=config, reset=reset)
    apply_org_toggles(org, config)
    structure_ctx = seed_structure(
        schema_name=org.schema_name,
        academic_structure=config.academic_structure,
        terminology=config.terminology,
    )

    pack_ctx: dict[str, Any] = {}
    pack_results: dict[str, Any] = {}
    for pack_id in config.scenario_pack_ids:
        pack_results[pack_id] = run_pack(
            pack_id,
            schema_name=org.schema_name,
            config=config,
            pack_ctx=pack_ctx,
        )

    import_result = {"skipped": True}
    if not skip_import:
        import_result = run_import_merge(
            config=config,
            schema_name=org.schema_name,
            structure_ctx=structure_ctx,
            pack_ctx=pack_ctx,
        )

    accounts = seed_demo_accounts(schema_name=org.schema_name, config=config)
    if "campus-staff-attendance" in pack_results:
        from app_demo.scenario_packs.campus_staff_attendance import apply_staff_account_labels

        apply_staff_account_labels(schema_name=org.schema_name, config=config)
    pack_ctx["demo_accounts"] = accounts
    script_outputs = generate_demo_script(config=config, pack_ctx=pack_ctx)

    return {
        "dry_run": False,
        "blueprint_id": blueprint_id,
        "brief_path": str(brief_path),
        "school_name": config.school_name,
        "schema_name": org.schema_name,
        "domain_url": org.domain_url,
        "scenario_pack_ids": list(config.scenario_pack_ids),
        "scenario_pack_results": pack_results,
        "import_result": import_result,
        "org": org,
        "accounts": accounts,
        "scripts": {
            "markdown_path": str(script_outputs["markdown_path"]),
            "json_path": str(script_outputs["json_path"]),
        },
    }
