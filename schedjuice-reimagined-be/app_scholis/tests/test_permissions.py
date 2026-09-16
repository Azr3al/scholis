"""
The permission codes these endpoints gate on.

The integration deliberately introduces no new codes. A new code is granted to
nobody until an administrator finds it in the matrix and assigns it, so a
feature gated on one ships dark: it deploys, it looks finished, and every caller
is refused. Reusing codes that already exist in ``app_rbac.catalog`` means
whoever can already manage grades can already use this, with no setup step.

That reasoning holds only if the codes named here really are the catalog's. A
typo is all but invisible in review and produces exactly the dark-feature
failure the design was trying to avoid, so it is worth asserting rather than
assuming -- and worth asserting against the catalog itself, which is the thing
roles are actually built from.

No database: this is a statement about two Python objects.
"""

from django.test import SimpleTestCase

from app_rbac import catalog
from app_scholis import views

# The views that gate on a permission. Listed explicitly so that the
# introspection below can be checked against it: if the introspection ever
# stops finding these classes, the assertions that follow would all pass
# vacuously, which is the one failure mode a guard test must not have.
GATED_VIEWS = {
    "ScholisConnectView",
    "ScholisPaperLinkView",
    "ScholisLaunchView",
    "ScholisTeacherLinkView",
    "ScholisScoreSyncView",
    "ScholisCatchUpView",
}


def _gated_views():
    """The view classes defined in this app that declare a permission gate."""
    for name, obj in sorted(vars(views).items()):
        if not isinstance(obj, type):
            continue
        # An imported base class (RBACView and friends) is not one of ours, and
        # its own gate says nothing about this integration.
        if not obj.__module__.startswith("app_scholis"):
            continue
        if "required_permissions" in obj.__dict__:
            yield name, obj


def _codes_of(gate):
    """Every code named by one view's gate, flattened across its methods.

    A gate value is either a single code or a list of codes, any one of which
    is sufficient -- ``{"GET": ["grade.manage", "grade.view_all"]}`` reads as
    "either of these will do", which is how a teacher who can see all grades
    gets in without also being able to change them.
    """
    for requirement in gate.values():
        if isinstance(requirement, str):
            yield requirement
        else:
            yield from requirement


class PermissionCodeTests(SimpleTestCase):
    def test_the_gated_views_are_exactly_the_ones_expected(self):
        self.assertEqual({name for name, _ in _gated_views()}, GATED_VIEWS)

    def test_every_code_named_by_a_gate_already_exists_in_the_catalog(self):
        unknown = {
            code
            for _, view in _gated_views()
            for code in _codes_of(view.required_permissions)
            if code not in catalog.ALL_CODES
        }
        self.assertEqual(
            unknown,
            set(),
            "no role can ever hold these, so every caller would be refused: %s"
            % sorted(unknown),
        )

    def test_no_gate_depends_on_a_code_a_school_cannot_assign(self):
        # PLATFORM_INTERNAL codes are the operator's and never appear in the
        # tenant matrix, so no school role can be given one. Gating a
        # school-facing endpoint on such a code would make it unreachable by
        # design rather than by accident.
        #
        # SCHOOL_SETUP codes are fine here: the catalog puts them in
        # TENANT_MATRIX_CODES alongside SCHOOL, so a school can assign them.
        # organization.manage is one, and it is the right gate for connecting an
        # integration -- the catalog describes it as managing "organization
        # settings and integrations".
        unassignable = {
            code
            for _, view in _gated_views()
            for code in _codes_of(view.required_permissions)
            if code in catalog.PLATFORM_INTERNAL_CODES
        }
        self.assertEqual(
            unassignable,
            set(),
            "these are operator-only codes and cannot be granted to a school "
            "role: %s" % sorted(unassignable),
        )

    def test_reading_marks_needs_less_than_writing_them(self):
        # The two list endpoints accept a read-only code as an alternative to a
        # managing one, so a person who may see every grade is not forced to
        # hold the power to change them just to look. If this ever regresses to
        # a single managing code, the endpoint still works -- it just quietly
        # stops working for read-only staff, who get a 403 with no explanation.
        for view_name in ("ScholisPaperLinkView", "ScholisScoreSyncView"):
            with self.subTest(view=view_name):
                gate = getattr(views, view_name).required_permissions["GET"]
                self.assertIsInstance(gate, list)
                self.assertIn("grade.view_all", gate)
                self.assertIn("grade.manage", gate)

    def test_the_webhook_receiver_has_no_permission_gate_at_all(self):
        # It cannot have one: Scholis is not a Schedjuice user and holds no
        # role. It authenticates by HMAC signature over the body instead, and an
        # empty permission_classes is how this codebase says "not RBAC-gated".
        #
        # Asserting the absence matters as much as the presence above. Giving
        # this view a gate would make every delivery fail with a 403 that looks
        # exactly like a bad signature, which is the hardest kind of webhook bug
        # to diagnose from the sending side.
        self.assertEqual(views.ScholisWebhookView.permission_classes, [])
        self.assertNotIn("required_permissions", views.ScholisWebhookView.__dict__)
