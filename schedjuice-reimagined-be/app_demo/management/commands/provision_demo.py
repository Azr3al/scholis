from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from app_demo.provision import provision_demo


class Command(BaseCommand):
    help = "Provision a demo tenant from blueprint + brief YAML."

    def add_arguments(self, parser):
        parser.add_argument("--blueprint", required=True)
        parser.add_argument("--brief", required=True)
        parser.add_argument("--reset", action="store_true")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--skip-import", action="store_true")

    def handle(self, *args, **options):
        try:
            result = provision_demo(
                blueprint_id=options["blueprint"],
                brief_path=Path(options["brief"]),
                reset=options["reset"],
                dry_run=options["dry_run"],
                skip_import=options["skip_import"],
            )
        except Exception as exc:
            raise CommandError(str(exc)) from exc

        if result.get("dry_run"):
            config = result["config"]
            self.stdout.write(
                self.style.WARNING(
                    f"Dry run only: {config['schema_name']} @ {config['domain_url']}"
                )
            )
            self.stdout.write(f"Scenario packs: {', '.join(config['scenario_pack_ids'])}")
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Provisioned {result['schema_name']} @ {result['domain_url']}"
            )
        )
        self.stdout.write(f"DEV_TENANT_DOMAIN={result['domain_url']}")
        self.stdout.write("Demo accounts:")
        password = result["accounts"]["password"]
        for account in result["accounts"]["accounts"]:
            self.stdout.write(f"  {account['email']} / {password} ({account['role']})")
        self.stdout.write(f"Script (md): {result['scripts']['markdown_path']}")
        self.stdout.write(f"Script (json): {result['scripts']['json_path']}")
