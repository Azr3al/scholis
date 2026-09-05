# Test cleanup — deleted (obvious) (2026-07-21)

| repo | slice_id | path | test_name | reason |
| --- | --- | --- | --- | --- |
| schedjuice-reimagined-be | be-app_ai | app_ai/tests/test_adjust_staff_points.py | `PointsReadToolTests.test_list_point_types_returns_active` | obvious-smoke |
| schedjuice-reimagined-be | be-app_ai | app_ai/tests/test_guardrails_classifier.py | `ClassifierTests.test_classifier_allowed` | tautology |
| schedjuice-reimagined-be | be-app_ai | app_ai/tests/test_guardrails_classifier.py | `ClassifierTests.test_classifier_rejected` | tautology |
| schedjuice-reimagined-be | be-app_ai | app_ai/tests/test_links.py | `BuildFrontendUrlTests.test_user_and_course_helpers` | tautology |
| schedjuice-reimagined-be | be-app_ai | app_ai/tests/test_packs.py | `ResolveEnabledPackIdsTests.test_explicit_packs` | tautology |
| schedjuice-reimagined-be | be-app_ai | app_ai/tests/test_tools_and_pricing.py | `GeminiAdapterTests.test_function_declaration_uses_parameters_json_schema` | tautology |
| schedjuice-reimagined-be | be-app_announcement | app_announcement/tests/test_rbac_announcement.py | `AnnouncementRBACTests.test_student_can_list_announcements` | obvious-smoke |
| schedjuice-reimagined-be | be-app_announcement | app_announcement/tests/test_rbac_announcement.py | `AnnouncementRBACTests.test_teacher_can_delete_course_announcement` | obvious-smoke |
| schedjuice-reimagined-be | be-app_attachment | app_attachment/tests/test_validation.py | `ValidateChatAttachmentUploadTests.test_accepts_heic_upload` | obvious-smoke |
| schedjuice-reimagined-be | be-app_attachment | app_attachment/tests/test_validation.py | `ValidateChatAttachmentUploadTests.test_accepts_webm_upload` | obvious-smoke |
| schedjuice-reimagined-be | be-app_attendance | app_attendance/tests/test_attendance_summary.py | `CourseAttendanceSummaryEndpointTests.test_course_summary_endpoint` | obvious-smoke |
| schedjuice-reimagined-be | be-app_attendance | app_attendance/tests/test_god_view_services.py | `GodViewServicesTest.test_paginate_rows` | tautology |
| schedjuice-reimagined-be | be-app_attendance | app_attendance/tests/test_legacy_attendance.py | `AttendanceByEventTest.get_by_event_test` | obvious-smoke |
| schedjuice-reimagined-be | be-app_attendance | app_attendance/tests/test_legacy_attendance.py | `AttendanceCreationTest.bulk_create_test` | setup-theater |
| schedjuice-reimagined-be | be-app_attendance | app_attendance/tests/test_marking_services.py | `AttendanceMarkingEndpointTests.test_build_bootstrap_service` | obvious-smoke |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_dvr.py | `NormalizeDvrFieldsTests.test_objects_preserved` | tautology |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_id_card.py | `IdCardTests.test_blood_type_persists` | tautology |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_id_card.py | `IdCardTests.test_user_serializer_exposes_photo_urls` | obvious-smoke |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_import_fields.py | `BuildImportFieldsTest.test_fields_endpoint_returns_schema` | obvious-smoke |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_import_user_match.py | `NormalizePhoneDigitsTest.test_already_digits` | tautology |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_login_legacy.py | `AuthTest.test_login` | obvious-smoke |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_user_ai_preferences_model.py | `UserAIPreferencesModelTests.test_defaults_when_created` | tautology |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_user_ai_preferences_model.py | `UserAIPreferencesModelTests.test_monthly_usd_limit_nullable` | tautology |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_user_merge.py | `UserMergeApplyTests.test_merge_preview_api` | obvious-smoke |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_web_push_subscription.py | `WebPushSubscriptionModelTest.test_create_web_push_subscription` | tautology |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_web_push_subscription.py | `WebPushSubscriptionModelTest.test_model_string_representation` | tautology |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_web_push_subscription_migration.py | `WebPushSubscriptionMigrationTest.test_webpushsubscription_constraint_exists` | tautology |
| schedjuice-reimagined-be | be-app_auth | app_auth/tests/test_web_push_subscription_migration.py | `WebPushSubscriptionMigrationTest.test_webpushsubscription_table_exists` | tautology |
| schedjuice-reimagined-be | be-app_chat | app_chat/tests/test_chat_thread_group_naming_unit.py | `ChatThreadGroupNamingUnitTests.test_group_name_is_stable_for_same_inputs` | tautology |
| schedjuice-reimagined-be | be-app_chat | app_chat/tests/test_dm_permissions.py | `DmPermissionsTests.test_staff_can_dm_staff` | obvious-smoke |
| schedjuice-reimagined-be | be-app_chat | app_chat/tests/test_dm_permissions.py | `DmPermissionsTests.test_teacher_can_dm_teacher` | obvious-smoke |
| schedjuice-reimagined-be | be-app_chat | app_chat/tests/test_reaction_helpers_unit.py | `AggregateReactionsUnitTests.test_empty` | tautology |
| schedjuice-reimagined-be | be-app_chat | app_chat/tests/test_reactions.py | `ChatMessageReactionTests.test_aggregate_reacted_by_me` | setup-theater |
| schedjuice-reimagined-be | be-app_chat | app_chat/tests/test_thread_endpoints.py | `ChatThreadReactionAndReadStateAndPresenceTests.test_toggle_reaction_on_course_thread_message` | obvious-smoke |
| schedjuice-reimagined-be | be-app_chat | app_chat/tests/test_thread_endpoints.py | `MessagePreviewHelperTests.test_build_message_preview_shape` | setup-theater |
| schedjuice-reimagined-be | be-app_course | app_course/tests/test_course_month_type.py | `CourseMonthTypeTests.test_day_10_is_fm` | setup-theater |
| schedjuice-reimagined-be | be-app_course | app_course/tests/test_import_matching.py | `NormalizeCourseTitleTest.test_lowercases_and_collapses_whitespace` | tautology |
| schedjuice-reimagined-be | be-app_course | app_course/tests/test_legacy_api.py | `CourseTest.test_course_event_edit` | obvious-smoke |
| schedjuice-reimagined-be | be-app_course | app_course/tests/test_legacy_api.py | `CourseTest.test_create_course` | obvious-smoke |
| schedjuice-reimagined-be | be-app_course | app_course/tests/test_legacy_api.py | `CourseTest.test_create_event` | obvious-smoke |
| schedjuice-reimagined-be | be-app_course | app_course/tests/test_legacy_api.py | `CourseTest.test_user_course_management` | obvious-smoke |
| schedjuice-reimagined-be | be-app_course | app_course/tests/test_roster_event_weekdays.py | `RosterEventWeekdayTests.test_format_weekday_labels_all_sessions` | tautology |
| schedjuice-reimagined-be | be-app_course | app_course/tests/test_user_uploaded_recording.py | `NormalizeYouTubeUrlTest.test_normalizes_to_watch_url` | tautology |
| schedjuice-reimagined-be | be-app_crm | app_crm/tests/test_models.py | `LeadModelTest.test_appointment_belongs_to_lead` | tautology |
| schedjuice-reimagined-be | be-app_crm | app_crm/tests/test_models.py | `LeadModelTest.test_create_lead_minimal` | tautology |
| schedjuice-reimagined-be | be-app_crm | app_crm/tests/test_models.py | `LeadModelTest.test_event_and_comment` | tautology |
| schedjuice-reimagined-be | be-app_crm | app_crm/tests/test_services.py | `SeedDataTest.test_default_sources_seeded` | obvious-smoke |
| schedjuice-reimagined-be | be-app_custom_fields | app_custom_fields/tests/test_builtin_registry.py | `BuiltinRegistryTests.test_is_builtin_key` | tautology |
| schedjuice-reimagined-be | be-app_custom_fields | app_custom_fields/tests/test_form_config_group_order.py | `BuildFormConfigGroupOrderTests.test_groups_ordered_by_fieldgroup_sort_order` | tautology |
| schedjuice-reimagined-be | be-app_custom_fields | app_custom_fields/tests/test_policy_validation.py | `StageRoleActorTests.test_user_legacy_wrapper_still_works` | obvious-smoke |
| schedjuice-reimagined-be | be-app_custom_fields | app_custom_fields/tests/test_rbac_custom_fields.py | `CustomFieldsRBACTests.test_admin_can_read_form_config` | obvious-smoke |
| schedjuice-reimagined-be | be-app_demo | app_demo/tests/test_artifact_views.py | `DemoArtifactViewsTests.test_blueprint_detail` | obvious-smoke |
| schedjuice-reimagined-be | be-app_demo | app_demo/tests/test_catalog.py | `CatalogScanTests.test_list_blueprint_ids` | obvious-smoke |
| schedjuice-reimagined-be | be-app_demo | app_demo/tests/test_demo_artifacts.py | `DemoArtifactsSmokeTests.test_tutoring_center_artifacts_load` | obvious-smoke |
| schedjuice-reimagined-be | be-app_demo | app_demo/tests/test_organization_is_demo.py | `OrganizationIsDemoFieldTests.test_is_demo_defaults_false` | tautology |
| schedjuice-reimagined-be | be-app_demo | app_demo/tests/test_provision_jobs.py | `DemoProvisionApiTests.test_status_for_sunrise_brief` | tautology |
| schedjuice-reimagined-be | be-app_demo | app_demo/tests/test_scenario_packs.py | `ScenarioPackArtifactTests.test_metadata_files_validate_for_v1_packs` | obvious-smoke |
| schedjuice-reimagined-be | be-app_demo | app_demo/tests/test_validation.py | `ArtifactLoadTests.test_load_blueprint_reads_file` | tautology |
| schedjuice-reimagined-be | be-app_finance | app_finance/tests/test_discount_api.py | `DiscountApiTests.test_apply_plain_discount_still_ok` | obvious-smoke |
| schedjuice-reimagined-be | be-app_finance | app_finance/tests/test_legacy_fully_paid_audit.py | `LegacyFullyPaidAuditIntegrationTests.test_management_command_runs` | obvious-smoke |
| schedjuice-reimagined-be | be-app_finance | app_finance/tests/test_legacy_fully_paid_audit.py | `LegacyFullyPaidHelperTests.test_csv_writer_includes_header` | tautology |
| schedjuice-reimagined-be | be-app_finance | app_finance/tests/test_legacy_fully_paid_backfill.py | `LegacyFullyPaidBackfillIntegrationTests.test_management_command_runs` | obvious-smoke |
| schedjuice-reimagined-be | be-app_finance | app_finance/tests/test_legacy_fully_paid_backfill.py | `LegacyFullyPaidBackfillUnitTests.test_csv_writer_includes_header` | tautology |
| schedjuice-reimagined-be | be-app_finance | app_finance/tests/test_payment_info.py | `PaymentInfoModelTests.test_multiple_payment_infos_per_user` | tautology |
| schedjuice-reimagined-be | be-app_finance | app_finance/tests/test_rbac_finance.py | `FinanceRBACTests.test_finance_role_can_access_admin_payment_report` | obvious-smoke |
| schedjuice-reimagined-be | be-app_finance | app_finance/tests/test_rbac_finance.py | `FinanceRBACTests.test_teacher_can_list_payment_methods` | obvious-smoke |
| schedjuice-reimagined-be | be-app_hr | app_hr/tests/test_school_overview_api.py | `SchoolOverviewAPITests.test_returns_count_and_enriched_fields` | obvious-smoke |
| schedjuice-reimagined-be | be-app_hr | app_hr/tests/test_school_overview_cache.py | `SchoolOverviewCacheTests.test_set_get_roundtrip` | tautology |
| schedjuice-reimagined-be | be-app_microsoft | app_microsoft/tests/test_scope_team_owner_repair.py | `ScanScopeTeamOwnerCandidatesTest.test_summarize_scope_owner_candidates` | tautology |
| schedjuice-reimagined-be | be-app_microsoft | app_microsoft/tests/test_teams_inline_images.py | `RasterFilenameTests.test_mime_png` | tautology |
| schedjuice-reimagined-be | be-app_microsoft | app_microsoft/tests/test_teams_inline_images.py | `RasterFilenameTests.test_pdf` | tautology |
| schedjuice-reimagined-be | be-app_microsoft | app_microsoft/tests/test_teams_inline_images.py | `RasterFilenameTests.test_png` | tautology |
| schedjuice-reimagined-be | be-app_microsoft | app_microsoft/tests/test_unlicensed_repair.py | `ScanUnlicensedUserCandidatesTests.test_scan_returns_evaluations` | tautology |
| schedjuice-reimagined-be | be-app_organization | app_organization/tests/test_acca_spreadsheet_import.py | `AccaImportParsingTests.test_normalize_gender` | tautology |
| schedjuice-reimagined-be | be-app_organization | app_organization/tests/test_ai_settings_api.py | `OrganizationAISettingsApiTests.test_get_ai_settings` | obvious-smoke |
| schedjuice-reimagined-be | be-app_organization | app_organization/tests/test_course_sheet_template.py | `CourseSheetTemplateFieldTests.test_accepts_teacher_su` | tautology |
| schedjuice-reimagined-be | be-app_organization | app_organization/tests/test_course_sheet_template.py | `CourseSheetTemplateFieldTests.test_default_is_none` | setup-theater |
| schedjuice-reimagined-be | be-app_organization | app_organization/tests/test_default_session_schedule.py | `DefaultSessionScheduleModelTests.test_model_field_defaults` | tautology |
| schedjuice-reimagined-be | be-app_organization | app_organization/tests/test_legacy_organization.py | `OrganizationTest (skipped legacy class; non-test_* methods)` | obvious-smoke |
| schedjuice-reimagined-be | be-app_points | app_points/tests/test_models.py | `PointModelsTest.test_point_type_and_transaction_create` | setup-theater |
| schedjuice-reimagined-be | be-app_product_docs | app_product_docs/tests/test_github_video_client.py | `ContentTypeForFilenameTests.test_mp4` | tautology |
| schedjuice-reimagined-be | be-app_product_docs | app_product_docs/tests/test_github_video_client.py | `ContentTypeForFilenameTests.test_png` | tautology |
| schedjuice-reimagined-be | be-app_product_docs | app_product_docs/tests/test_media_upload.py | `ClassifyUploadTests.test_image_png` | tautology |
| schedjuice-reimagined-be | be-app_product_docs | app_product_docs/tests/test_media_upload.py | `ClassifyUploadTests.test_video_mp4` | tautology |
| schedjuice-reimagined-be | be-app_product_docs | app_product_docs/tests/test_media_upload.py | `ImageSnippetTests.test_builds_standard_markdown` | tautology |
| schedjuice-reimagined-be | be-app_product_docs | app_product_docs/tests/test_services.py | `AudienceFilterTests.test_student_does_not_see_admin_only_article` | obvious-smoke |
| schedjuice-reimagined-be | be-app_product_docs | app_product_docs/tests/test_services.py | `AudienceFilterTests.test_student_sees_all_audience_not_admin_only` | obvious-smoke |
| schedjuice-reimagined-be | be-app_quiz_v3 | app_quiz_v3/tests/test_grading_release_models.py | `AttemptAnswerFeedbackFieldTests.test_feedback_defaults_to_empty_tiptap_doc` | tautology |
| schedjuice-reimagined-be | be-app_quiz_v3 | app_quiz_v3/tests/test_grading_release_models.py | `AttemptAnswerSerializerTests.test_serializer_exposes_feedback_and_comments` | setup-theater |
| schedjuice-reimagined-be | be-app_quiz_v3 | app_quiz_v3/tests/test_grading_release_models.py | `QuizAttemptWaiverFieldsTests.test_waiver_fields_default_to_null` | tautology |
| schedjuice-reimagined-be | be-app_rbac | app_rbac/tests/test_catalog.py | `CatalogTests.test_all_codes_set_matches_registry` | tautology |
| schedjuice-reimagined-be | be-app_rbac | app_rbac/tests/test_catalog.py | `CatalogTests.test_known_codes_present` | obvious-smoke |
| schedjuice-reimagined-be | be-app_rbac | app_rbac/tests/test_data_sheet_permissions.py | `DataSheetPermissionTests.test_codes_registered` | setup-theater |
| schedjuice-reimagined-be | be-app_tasks | app_tasks/tests/test_cron_health.py | `SchedulerHealthTests.test_evaluate_scheduler_qcluster_alive` | obvious-smoke |
| schedjuice-reimagined-be | be-app_tasks | app_tasks/tests/test_cron_registry.py | `CronRegistryTests.test_schedule_dicts_match_registry_count` | tautology |
| schedjuice-reimagined-be | be-app_tasks | app_tasks/tests/test_eas_webhook.py | `EasWebhookEmbedTests.test_build_embed_includes_profile_and_dashboard` | obvious-smoke |
| schedjuice-reimagined-be | be-app_telegram | app_telegram/tests/test_admin_link.py | `TelegramAdminLinkTests.test_self_service_link_token_still_works` | obvious-smoke |
| schedjuice-reimagined-be | be-app_telegram | app_telegram/tests/test_client_reactions.py | `TelegramAckReactionConfigTests.test_ack_reactions_are_telegram_valid` | tautology |
| schedjuice-reimagined-be | be-app_telegram | app_telegram/tests/test_commands.py | `TelegramCommandTests.test_set_webhooks_runs_without_error` | setup-theater |
| schedjuice-reimagined-be | be-app_telegram | app_telegram/tests/test_formatting.py | `MarkdownToTelegramHtmlTests.test_empty_string` | tautology |
| schedjuice-reimagined-be | be-app_telegram | app_telegram/tests/test_model_fields.py | `TelegramModelFieldTests.test_user_has_telegram_fields` | tautology |
| schedjuice-reimagined-be | be-app_telegram | app_telegram/tests/test_models.py | `TelegramModelsTests.test_processed_update_dedupe` | tautology |
| schedjuice-reimagined-be | be-app_telegram | app_telegram/tests/test_re_register_webhook.py | `TelegramReRegisterWebhookTests.test_service_re_register` | obvious-smoke |
| schedjuice-reimagined-be | be-app_userlog | app_userlog/tests/test_models.py | `ReportTypeModelTest.test_log_entry_with_version_and_event` | tautology |
| schedjuice-reimagined-be | be-app_userlog | app_userlog/tests/test_models.py | `ReportTypeModelTest.test_report_type_and_fields_create` | tautology |
| schedjuice-reimagined-be | be-app_utility_notifications | app_utility_notifications/tests/test_class_starting_soon_cron.py | `EventsInClassStartingSoonWindowTest.test_window_constants` | tautology |
| schedjuice-reimagined-be | be-app_utility_notifications | app_utility_notifications/tests/test_views.py | `UtilityNotificationsViewImportTest.test_view_class_is_importable` | obvious-smoke |
| schedjuice-reimagined-be | be-app_utils | app_utils/tests/test_import_parse.py | `ImportParseApiTest.test_parse_endpoint_returns_headers` | setup-theater |
| schedjuice-reimagined-be | be-app_utils | app_utils/tests/test_import_parse.py | `ImportParseApiTest.test_parse_endpoint_returns_headers_from_csv` | setup-theater |
| schedjuice-reimagined-be | be-app_utils | app_utils/tests/test_ops_discord.py | `BuildOpsEmbedTests.test_builds_embed_with_fields_and_footer` | tautology |
| schedjuice-reimagined-be | be-app_utils | app_utils/tests/test_ops_discord.py | `EmbedColorTests.test_severity_colors` | tautology |
| schedjuice-reimagined-be | be-app_utils | app_utils/tests/test_push_helpers.py | `PushHelpersUnitTestCase.test_send_web_push_success` | obvious-smoke |
| schedjuice-reimagined-be | be-app_zoom | app_zoom/tests/test_client.py | `ZoomClientHttpTest.test_list_report_meeting_participants` | obvious-smoke |
| schedjuice-reimagined-be | be-app_zoom | app_zoom/tests/test_client.py | `ZoomClientHttpTest.test_update_meeting` | tautology |
| schedjuice-reimagined-be | be-app_zoom | app_zoom/tests/test_crypto.py | `TokenCryptoTest.test_unicode_round_trip` | tautology |
| schedjuice-reimagined-be | be-app_zoom | app_zoom/tests/test_oauth.py | `OAuthHttpTest.test_exchange_code_returns_payload` | tautology |
| schedjuice-reimagined-be | be-utilitas | utilitas/tests/test_search_engine.py | `SearchEngineRegistryTests.test_registered_entity_search_returns_matches` | setup-theater |
| schedjuice-reimagined-be | be-utilitas | utilitas/tests/test_split_expand_for_orm.py | `SplitExpandForOrmTest.test_academic_hub_expand_split` | tautology |
| schedjuice-reimagined-fe | fe-components-attendance | src/components/attendance/attendance-row-save-tracking.test.ts | `includes note dirty rows` | tautology |
| schedjuice-reimagined-fe | fe-components-attendance | src/components/attendance/attendance-row-save-tracking.test.ts | `includes status dirty rows` | tautology |
| schedjuice-reimagined-fe | fe-components-attendance | src/components/attendance/attendance-status-config.test.ts | `keeps unregistered neutral (no success/warning/danger ring)` | tautology |
| schedjuice-reimagined-fe | fe-components-attendance | src/components/attendance/attendance-status-config.test.ts | `uses /20 fill and semantic ring for absent` | tautology |
| schedjuice-reimagined-fe | fe-components-attendance | src/components/attendance/attendance-status-config.test.ts | `uses /20 fill and semantic ring for late` | tautology |
| schedjuice-reimagined-fe | fe-components-attendance | src/components/attendance/attendance-status-config.test.ts | `uses /20 fill and semantic ring for present` | tautology |
| schedjuice-reimagined-fe | fe-components-auto-form | src/components/auto-form/__tests__/auto-form-submit.test.ts | `renders inline root error banner` | tautology |
| schedjuice-reimagined-fe | fe-components-auto-form | src/components/auto-form/__tests__/field-map-switch.test.tsx | `keeps error slot inside the label column, not as a Switch sibling` | tautology |
| schedjuice-reimagined-fe | fe-components-auto-form | src/components/auto-form/__tests__/field-measure.test.ts | `AutoFormProps exposes measure` | tautology |
| schedjuice-reimagined-fe | fe-components-auto-form | src/components/auto-form/__tests__/field-measure.test.ts | `AutoFormSelectControl passes size default to Select` | tautology |
| schedjuice-reimagined-fe | fe-components-auto-form | src/components/auto-form/__tests__/field-measure.test.ts | `field-map uses fieldMeasureClassName instead of hardcoded max-w-xl` | tautology |
| schedjuice-reimagined-fe | fe-components-course | src/components/course/record/course-section-rail.test.tsx | `renders section links and group labels when course is loaded` | obvious-smoke |
| schedjuice-reimagined-fe | fe-components-data-sheet | src/components/data-sheet/lib/clipboard-tsv.test.ts | `joins cells with tabs and rows with newlines` | tautology |
| schedjuice-reimagined-fe | fe-components-data-sheet | src/components/data-sheet/lib/clipboard-tsv.test.ts | `splits a simple grid` | tautology |
| schedjuice-reimagined-fe | fe-components-data-sheet | src/components/data-sheet/lib/toolbar-compact.test.ts | `stays expanded when content fits` | tautology |
| schedjuice-reimagined-fe | fe-components-data-sheet | src/components/data-sheet/types.test.ts | `builds full canvas font strings from px and font family` | tautology |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/__tests__/column-layout.test.ts | `carries sticky left into the layout model` | tautology |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/__tests__/column-layout.test.ts | `data-table column builders set a default sizing role` | tautology |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/__tests__/column-resize-storage.test.ts | `scopes localStorage key per table` | tautology |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/__tests__/columns.test.ts | `builds a typed text column with id and accessor` | tautology |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/__tests__/columns.test.ts | `preserves sizing metadata on the column` | tautology |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/__tests__/resource-table-open-link.test.ts | `uses high-contrast action styling instead of text-accent` | tautology |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/__tests__/table-layout.test.tsx | `renders colgroup with minWidth from column sizing` | obvious-smoke |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/parts/toolbar.test.tsx | `renders pinned toolbar when sticky is false` | obvious-smoke |
| schedjuice-reimagined-fe | fe-components-data-table | src/components/data-table/parts/toolbar.test.tsx | `renders sticky toolbar by default` | obvious-smoke |
| schedjuice-reimagined-fe | fe-components-date | src/components/date/__tests__/date-picker-consolidation.test.ts | `public DatePicker forwards refs for both variants` | tautology |
| schedjuice-reimagined-fe | fe-components-date | src/components/date/__tests__/date-picker-consolidation.test.ts | `users/date-picker re-exports from canonical module` | tautology |
| schedjuice-reimagined-fe | fe-components-edit-kit | src/components/edit-kit/__tests__/cell-autosave-input.test.tsx | `exposes click-to-edit aria label when idle` | obvious-smoke |
| schedjuice-reimagined-fe | fe-components-filters | src/components/filters/filter-toolbar.test.tsx | `renders label with toolbar spacing and width token` | tautology |
| schedjuice-reimagined-fe | fe-components-filters | src/components/filters/filter-toolbar.test.tsx | `returns consistent field stack spacing` | tautology |
| schedjuice-reimagined-fe | fe-components-filters | src/components/filters/filter-toolbar.test.tsx | `uses dashboard filter toolbar layout classes` | tautology |
| schedjuice-reimagined-fe | fe-components-form | src/components/form/combobox-search-header.test.tsx | `defaults to Search {label}…` | tautology |
| schedjuice-reimagined-fe | fe-components-form | src/components/form/combobox-search-header.test.tsx | `prefers explicit placeholder` | tautology |
| schedjuice-reimagined-fe | fe-components-form | src/components/form/combobox-search-header.test.tsx | `returns Search {label}` | tautology |
| schedjuice-reimagined-fe | fe-components-home | src/components/home/__tests__/widget-registry.test.ts | `each widget declares an id, span and requiredPermissions` | setup-theater |
| schedjuice-reimagined-fe | fe-components-images | src/components/images/image-crop-presets.test.ts | `returns 1 for square` | tautology |
| schedjuice-reimagined-fe | fe-components-images | src/components/images/image-crop-presets.test.ts | `returns 2.35 for cover banner` | tautology |
| schedjuice-reimagined-fe | fe-components-layout | src/components/layout/__tests__/page-composition.test.ts | `PageContainer accepts density prop` | tautology |
| schedjuice-reimagined-fe | fe-components-layout | src/components/layout/__tests__/page-header.test.tsx | `renders serif page title at text-3xl scale` | obvious-smoke |
| schedjuice-reimagined-fe | fe-components-organization | src/components/organization/organization-logo-placements.test.ts | `lists all six preview surfaces from the spec` | tautology |
| schedjuice-reimagined-fe | fe-components-primitives | src/components/primitives/__tests__/overlay-layers.test.ts | `dialog uses modal backdrop and content layers` | tautology |
| schedjuice-reimagined-fe | fe-components-primitives | src/components/primitives/__tests__/overlay-layers.test.ts | `dropdown positioner helper uses z-dropdown` | tautology |
| schedjuice-reimagined-fe | fe-components-primitives | src/components/primitives/__tests__/overlay-layers.test.ts | `toast viewport uses z-toast` | tautology |
| schedjuice-reimagined-fe | fe-components-quiz-v3 | src/components/quiz-v3/taker/quiz-autosave-mirror.test.ts | `combines prefix, code, and attempt id` | tautology |
| schedjuice-reimagined-fe | fe-components-rbac | src/components/rbac/__tests__/matrix-grid.test.ts | `formats domain labels for display` | tautology |
| schedjuice-reimagined-fe | fe-components-record | src/components/record/inline/undo-core.test.ts | `builds an entry capturing the previous value + timestamp` | tautology |
| schedjuice-reimagined-fe | fe-components-scheduling | src/components/scheduling/simple-schedule-picker.test.tsx | `renders custom slot` | obvious-smoke |
| schedjuice-reimagined-fe | fe-components-shell | src/components/shell/internal-app-shell.test.tsx | `provides SidebarProvider so usePageHeader pages can render` | obvious-smoke |
| schedjuice-reimagined-fe | fe-components-shell | src/components/shell/toolbar-segment-group.test.ts | `returns active classes when pressed` | tautology |
| schedjuice-reimagined-fe | fe-components-shell | src/components/shell/toolbar-segment-group.test.ts | `returns inactive classes when not pressed` | tautology |
| schedjuice-reimagined-fe | fe-config | src/config/__tests__/nav-routes.test.ts | `is permission-driven: every leaf declares a requiredPermissions array` | obvious-smoke |
| schedjuice-reimagined-fe | fe-config | src/config/__tests__/route-permissions.test.ts | `every anyOf rule lists at least one permission code` | tautology |
| schedjuice-reimagined-fe | fe-config | src/config/course-record-nav.test.ts | `PANEL_OVERFLOW_EXCLUDED_HREFS excludes promoted edit from panel overflow` | tautology |
| schedjuice-reimagined-fe | fe-config | src/config/course-record-nav.test.ts | `RAIL_OVERFLOW_EXCLUDED_HREFS excludes promoted rail sections from overflow` | tautology |
| schedjuice-reimagined-fe | fe-config | src/config/org-record-sections.test.ts | `DEFAULT_ORG_SECTION is overview` | tautology |
| schedjuice-reimagined-fe | fe-config | src/config/org-record-sections.test.ts | `isOrgSectionId accepts known sections` | obvious-smoke |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/academic-hub/status-counts.test.ts | `returns planned and ended directly` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-dashboard.test.ts | `formats attended over total` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-dashboard.test.ts | `passes through YMD` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-dashboard.test.ts | `returns YYYY-MM-01 for a date` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-dashboard.test.ts | `returns aggregate for a month anchor` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-dashboard.test.ts | `returns full month name` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-dashboard.test.ts | `returns matrix and students from a success body` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-dashboard.test.ts | `uses plural for 0 and many` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-dashboard.test.ts | `uses singular for 1` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/attendance-include-removed-storage.test.ts | `scopes localStorage key per course` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/calendar-overlap.test.ts | `isDraftEventId detects new-prefixed ids` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/course-repeat.test.ts | `delegates to formatRepeatEverySummary` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/course/roster-table-utils.test.ts | `returns assistant badge for ASSISTANT_TEACHER` | obvious-smoke |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/duplicate-cluster-display.test.ts | `delegates to isSuspiciousContact` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/dvr.test.ts | `includes all catalog fields as optional` | obvious-smoke |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/dvr.test.ts | `returns only required` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/form.test.ts | `returns the first native invalid control in DOM order` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/intake-course-titles.test.ts | `returns the base title for the first occurrence` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/payment-receipt.test.ts | `builds group filename` | tautology |
| schedjuice-reimagined-fe | fe-helpers | src/helpers/payment-receipt.test.ts | `formats two contiguous months as a range` | obvious-smoke |
| schedjuice-reimagined-fe | fe-hooks | src/hooks/__tests__/useRbacLiveRefresh.test.ts | `isRbacUpdateMessage returns true for an rbac.updated payload` | obvious-smoke |
| schedjuice-reimagined-fe | fe-hooks | src/hooks/useInternalTenant.test.ts | `normalizeInternalTenantId trims non-empty values` | tautology |
| schedjuice-reimagined-fe | fe-lib-attachment | src/lib/attachment/attachment-url.test.ts | `detects via is_image flag` | tautology |
| schedjuice-reimagined-fe | fe-lib-autosave | src/lib/autosave/autosave-core.test.ts | `defaults to the field alone when no units are given` | tautology |
| schedjuice-reimagined-fe | fe-lib-autosave | src/lib/autosave/autosave-core.test.ts | `picks only the named fields` | tautology |
| schedjuice-reimagined-fe | fe-lib-changelog | src/lib/changelog/changelog-utils.test.ts | `labels categories in plain language` | tautology |
| schedjuice-reimagined-fe | fe-lib-changelog | src/lib/changelog/changelog-utils.test.ts | `seed entries expose summarizedCommits for incremental runs` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-changelog | src/lib/changelog/changelog-utils.test.ts | `seed entries have unique ids and valid dates` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-changelog | src/lib/changelog/changelog-utils.test.ts | `slugifies titles for screenshot folders` | tautology |
| schedjuice-reimagined-fe | fe-lib-chat-threads | src/lib/chat-threads/course-last-messages-query.test.ts | `maps preview fields for a course with activity` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-chat-threads | src/lib/chat-threads/derive-dm-participant.test.ts | `adds other_participant for list rendering` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-chat | src/lib/chat/chat-attachments.test.ts | `maps attachments envelope` | tautology |
| schedjuice-reimagined-fe | fe-lib-chat | src/lib/chat/use-voice-recorder.test.ts | `names voice files with the chosen extension` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/course-cache.test.ts | `supports bulk flows without a course id` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/address-keys.test.ts | `lists the canonical address cluster keys` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/build-form-sections.test.ts | `splitCreateFormSections separates identity from additional create sections` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/completion.test.ts | `defines user and admin audiences` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/completion.test.ts | `includes normalized custom datetime values` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/completion.test.ts | `returns the first missing label or null` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/definition-defaults.test.ts | `never hides create, shows edit+detail` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/form-config-query.test.ts | `builds the url with encoded roles` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/parse-form-config.test.ts | `unwraps the standard API envelope from axios res.data` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/preview-perspective.test.ts | `maps self to user and staff to admin` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/preview-perspective.test.ts | `returns toggle labels` | tautology |
| schedjuice-reimagined-fe | fe-lib-custom-fields | src/lib/custom-fields/reorder-ops.test.ts | `assigns 0..n sort_order and the target group_id to ordered ids` | tautology |
| schedjuice-reimagined-fe | fe-lib-data-sheets | src/lib/data-sheets/course-data-grouping.test.ts | `group order constant has all 5 groups` | tautology |
| schedjuice-reimagined-fe | fe-lib-data-sheets | src/lib/data-sheets/course-data-paired-layout.test.ts | `preserves main and assistant teacher fields on paired cells` | tautology |
| schedjuice-reimagined-fe | fe-lib-data-sheets | src/lib/data-sheets/monthly-result-sheet-adapter.test.ts | `reads student identity and marks` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-data-sheets | src/lib/data-sheets/read-only-adapter.test.ts | `delegates getCellValue` | tautology |
| schedjuice-reimagined-fe | fe-lib-data-sheets | src/lib/data-sheets/read-only-adapter.test.ts | `reports row count` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/payment-group-utils.test.ts | `includes description and remarks per part index` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/recent-transactions-column-meta.test.ts | `assigns parsed_amount numeric right alignment when verifier` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/recent-transactions-column-meta.test.ts | `assigns transaction_id a wide identifier role with left alignment` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/remaining-amount.test.ts | `sums invoiced_amount across preview periods` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/student-payments-filter-ui.test.ts | `exposes Glide txn and description width floors` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/student-payments-filter-ui.test.ts | `keeps shared input sizing classes` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/student-payments-filter-ui.test.ts | `match the collapsible-pane wider floors` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/student-payments-filter-ui.test.ts | `paymentEditableFieldInputClassName uses 18rem txn and 20rem description` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/student-payments-resource-column-meta.test.ts | `includes created_by after description and before _actions` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/student-payments-resource-column-meta.test.ts | `sets description prose floor to 20rem left aligned` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/student-payments-resource-column-meta.test.ts | `sets parsed_amount money column left aligned for editable table` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/student-payments-resource-column-meta.test.ts | `sets transaction_id identifier floor to 18rem` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/upload-form-layout.test.ts | `matches validateUploadForm field names for screenshot` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/upload-form-layout.test.ts | `returns flat layout stack with full width min-w-0` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/upload-form-layout.test.ts | `returns sticky bottom action bar with elevated chrome` | tautology |
| schedjuice-reimagined-fe | fe-lib-finances | src/lib/finances/upload-part-validation.test.ts | `prioritizes form-level OCR loading error` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-fullscreen | src/lib/fullscreen/fullscreen-state.test.ts | `shows the topbar toggle only when fullscreen is available` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/build-id-card.test.ts | `builds a staff card from row roles` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/build-id-card.test.ts | `builds a student card with student accent` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/build-id-card.test.ts | `computes initials from the name` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/build-id-card.test.ts | `labels a student-only set as Student` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/build-id-card.test.ts | `labels staff by highest priority` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/id-card-layout.test.ts | `compresses spacing for dense layouts while staying within bounds` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/id-card-layout.test.ts | `keeps QR box and verify text aligned to panel top` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/id-card-layout.test.ts | `stacks detail row baselines with gap after role pill` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/image-proxy.test.ts | `allows https URLs on allowlisted hosts` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/image-proxy.test.ts | `builds a same-origin proxy query string` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/qr.test.ts | `produces a PNG data URL` | tautology |
| schedjuice-reimagined-fe | fe-lib-id-card | src/lib/id-card/svg-data-url.test.ts | `encodes an SVG string into a utf8 data URL` | tautology |
| schedjuice-reimagined-fe | fe-lib-imports | src/lib/imports/parse-excel-paste.test.ts | `parses multiple data rows` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-imports | src/lib/imports/parse-excel-paste.test.ts | `parses multiple lines as multiple rows` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-imports | src/lib/imports/resolution.test.ts | `joins rowId and field` | tautology |
| schedjuice-reimagined-fe | fe-lib-imports | src/lib/imports/wizard-logic.test.ts | `includes address fields` | tautology |
| schedjuice-reimagined-fe | fe-lib-imports | src/lib/imports/wizard-logic.test.ts | `maps address fields` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-imports | src/lib/imports/wizard-logic.test.ts | `marks email and courses special` | tautology |
| schedjuice-reimagined-fe | fe-lib-layout | src/lib/layout/page-width.test.ts | `exposes the list of tiers` | tautology |
| schedjuice-reimagined-fe | fe-lib-layout | src/lib/layout/page-width.test.ts | `maps each tier to its max-width class` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/leads-table.test.ts | `includes the core columns in order` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/leads-table.test.ts | `renders plain fields` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-linking | src/lib/linking/build-app-deep-link.test.ts | `assetlinks is empty` | tautology |
| schedjuice-reimagined-fe | fe-lib-microsoft | src/lib/microsoft/password-reset-bulk.test.ts | `exports cap of 50` | tautology |
| schedjuice-reimagined-fe | fe-lib-org | src/lib/org/__tests__/org-section-href.test.ts | `builds platform org record section links` | tautology |
| schedjuice-reimagined-fe | fe-lib-org | src/lib/org/__tests__/org-section-href.test.ts | `uses platform org record path` | tautology |
| schedjuice-reimagined-fe | fe-lib-org | src/lib/org/__tests__/org-section-href.test.ts | `uses tenant profile path` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/password-requirements.test.ts | `exposes five stable rule ids in order` | tautology |
| schedjuice-reimagined-fe | fe-lib-points | src/lib/points/staff-sheet-columns.test.ts | `formats fixed columns` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/posthog.test.ts | `includes internal routes` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-product-docs | src/lib/product-docs/heading-to-id.test.ts | `slugifies heading text` | tautology |
| schedjuice-reimagined-fe | fe-lib-product-docs | src/lib/product-docs/media-markdown.test.ts | `buildImageSnippet` | tautology |
| schedjuice-reimagined-fe | fe-lib-product-docs | src/lib/product-docs/media-markdown.test.ts | `buildVideoSnippet` | tautology |
| schedjuice-reimagined-fe | fe-lib-product-docs | src/lib/product-docs/media-markdown.test.ts | `classifies image` | tautology |
| schedjuice-reimagined-fe | fe-lib-product-docs | src/lib/product-docs/media-markdown.test.ts | `classifies video` | tautology |
| schedjuice-reimagined-fe | fe-lib-product-docs | src/lib/product-docs/slugify.test.ts | `kebab-cases titles` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/resolve-utility-notification-href.test.ts | `resolves /finances/make-payment` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/resolve-utility-notification-href.test.ts | `resolves /finances/recent-transactions` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/resolve-utility-notification-href.test.ts | `resolves /finances/student-payments` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/resolve-utility-notification-href.test.ts | `resolves /services/org-wide-announcements on web` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/resolve-utility-notification-href.test.ts | `resolves /shortcuts/todays-classes` | tautology |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/resolve-utility-notification-href.test.ts | `resolves /shortcuts/unpaid-course-counts` | tautology |
| schedjuice-reimagined-fe | fe-lib-sj | src/lib/sj/legacy-token-aliases.test.ts | `maps card surface tokens` | tautology |
| schedjuice-reimagined-fe | fe-lib-sj | src/lib/sj/legacy-token-aliases.test.ts | `maps destructive to danger` | tautology |
| schedjuice-reimagined-fe | fe-lib-sj | src/lib/sj/legacy-token-aliases.test.ts | `maps muted-foreground to text-text-muted` | tautology |
| schedjuice-reimagined-fe | fe-lib-sj | src/lib/sj/palette.test.ts | `action tokens match accent (content-reset-safe primary fills)` | tautology |
| schedjuice-reimagined-fe | fe-lib-sj | src/lib/sj/palette.test.ts | `dark action tokens match accent (content-reset-safe primary fills)` | tautology |
| schedjuice-reimagined-fe | fe-lib-sound | src/lib/sound/stagger-tick-sound.test.ts | `documents cap — animation and sound apply to first N rows only` | tautology |
| schedjuice-reimagined-fe | fe-lib-sound | src/lib/sound/stagger-tick-sound.test.ts | `returns 440 Hz at index 0` | tautology |
| schedjuice-reimagined-fe | fe-lib-subjects | src/lib/subjects/parse-subject-column.test.ts | `applies title case when enabled` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/__tests__/route-manifest-generator.test.ts | `assigns every route exactly one route family` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/__tests__/route-manifest-schema.test.ts | `parses all route families` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/__tests__/route-manifest-schema.test.ts | `parses coverage modes and verification variants` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/__tests__/route-manifest-schema.test.ts | `parses risk tiers and qa status` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/__tests__/sync-route-qa-status.test.ts | `maps pass evidence to pass` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r10-content-route-classes.test.ts | `centers public take flow` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r10-content-route-classes.test.ts | `keeps toolbar actions wrapping` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r10-content-route-classes.test.ts | `stacks editorial routes with wider gaps` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r10-content-route-classes.test.ts | `stacks tool routes with consistent gaps` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r6-global-route-classes.test.ts | `maps auth-minimal to narrow` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r6-global-route-classes.test.ts | `maps public-card to default` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r6-global-route-classes.test.ts | `maps shell-standard to default` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts | `includes responsive columns for 4-up metrics` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts | `uses larger gap for comfortable density` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts | `wraps filters without forcing fixed widths` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts | `stacks detail sections vertically` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts | `uses semantic surface tokens` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts | `wraps actions on narrow viewports` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r9-course-record-layout-classes.test.ts | `aligns body cells with header padding` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r9-course-record-layout-classes.test.ts | `includes elevated sticky chrome without duplicate surface overrides` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r9-course-record-layout-classes.test.ts | `pads and prevents header text wrapping` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r9-course-record-layout-classes.test.ts | `scrolls horizontally before crushing columns` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r9-course-record-layout-classes.test.ts | `separates header row from body` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r9-course-record-layout-classes.test.ts | `sets full width and minimum table width` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r9-course-record-layout-classes.test.ts | `stacks tab sections with min-width guard` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui-remediation | src/lib/ui-remediation/r9-course-record-layout-classes.test.ts | `uses sticky in-flow layer token` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/__tests__/control-sizing.test.ts | `maps full size to fullWidth trigger classes` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/__tests__/control-sizing.test.ts | `returns compact height for table cells` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/__tests__/control-sizing.test.ts | `returns full width mode for full size` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/__tests__/field-measure.test.ts | `falls back to form default` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/__tests__/field-measure.test.ts | `prefers field-level measure over form default` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/__tests__/field-measure.test.ts | `returns max-w-xl for default measure` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/__tests__/field-measure.test.ts | `returns unconstrained width for full measure` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/__tests__/select-layout.test.ts | `accepts ControlSize instead of fullWidth boolean` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/global-overlay-registry.test.tsx | `returns true while an overlay is registered` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/modal-overlay-context.test.tsx | `merges extra positioner classes` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/overlay-layers.test.ts | `exposes tailwind utilities` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/select-layout.test.ts | `floors the status cell around 13.5rem` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/select-layout.test.ts | `keeps placeholder muted styling hook` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/select-layout.test.ts | `keeps the value on one line and truncates when constrained` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/select-layout.test.ts | `uses a rounded ring for focus (not rectangular outline)` | tautology |
| schedjuice-reimagined-fe | fe-lib-ui | src/lib/ui/select-layout.test.ts | `uses fixed height and shared chrome for default (non-fullWidth)` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-user-logs | src/lib/user-logs/report-type-field-reorder.test.ts | `sets sort_order to array index` | tautology |
| schedjuice-reimagined-fe | fe-lib-user-logs | src/lib/user-logs/report-type-field-validation.test.ts | `passes a valid text field` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-user-logs | src/lib/user-logs/report-type-field-validation.test.ts | `returns friendly labels` | tautology |
| schedjuice-reimagined-fe | fe-lib-users | src/lib/users/staff-user-search-display.test.ts | `returns alt name only when email is missing` | tautology |
| schedjuice-reimagined-fe | fe-lib-users | src/lib/users/user-combobox-search.test.ts | `joins name, alt name, and email with spaces` | obvious-smoke |
| schedjuice-reimagined-fe | fe-lib-root | src/lib/youtube.test.ts | `builds thumbnail and watch URLs` | tautology |
| schedjuice-reimagined-fe | fe-types | src/types/__tests__/ai-usage-analytics.test.ts | `parses analytics payload` | obvious-smoke |
| schedjuice-reimagined-fe | fe-types | src/types/__tests__/ai-usage.test.ts | `formats as percentage with one decimal` | tautology |
| schedjuice-reimagined-fe | fe-types | src/types/__tests__/ai-usage.test.ts | `formats zero` | tautology |
| schedjuice-reimagined-fe | fe-types | src/types/course-feed.test.ts | `formats daily lesson display header without unit` | tautology |
| schedjuice-reimagined-fe | fe-types | src/types/course-feed.test.ts | `formats daily lesson header` | tautology |
| schedjuice-reimagined-fe | fe-types | src/types/course-feed.test.ts | `resolves author avatar from expanded created_by` | tautology |
| schedjuice-reimagined-fe | fe-types | src/types/course-feed.test.ts | `resolves author name from expanded created_by` | tautology |
