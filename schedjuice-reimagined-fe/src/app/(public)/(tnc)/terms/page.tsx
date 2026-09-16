import { formatDate } from "@/helpers/date-server";
import { getTenantOnServer } from "@/helpers/tenant";

const tenant = async () => await getTenantOnServer();

const Terms = async () => {
  const t = await tenant();
  return (
    <>
      {t.tenant && (
        <>
          <h1 className=" text-5xl">Terms of Service</h1>
          <div className="space-y-3">
            <p>Effective date: {formatDate(new Date(2024, 0, 1))}</p>
            <div>
              <h2>1. Acceptance of Terms</h2>
              <p className="m-2">
                Welcome to {t.tenant.name}'s cloud-based school management
                software-as-a-service. From here onwards, we will refer to our
                website and services as "the LMS". By using the LMS and by being
                a member of the organization, you agree to comply with and be
                bound by these Terms of Service. If you do not agree with these
                terms, please do not use our services.
              </p>
            </div>

            <div>
              <h2>2. User Accounts</h2>
              <div className="m-2">
                <h3>2.1 Role-Based Accesss</h3>
                <p className="m-2">
                  Teachers, school admins, and students will receive accounts
                  with specific roles and permissions. You agree to use the
                  service in accordance with your assigned role.
                </p>
              </div>
            </div>

            <div>
              <h2>3. Use of Services</h2>
              <div className="m-2">
                <h3>3.1 Compliance with Laws</h3>
                <p className="m-2">
                  You agree to use the LMS in compliance with all applicable
                  laws and regulations.
                </p>
                <h3>3.2 Prohibited Activities</h3>
                <p className="m-2">
                  You must not engage in any activities that could harm,
                  disable, overburden, or impair our services or interfere with
                  any other user's use of our services.
                </p>
              </div>
            </div>
            <div>
              <h2>4. Intellectual Property</h2>
              <p className="m-2">
                The LMS and its content are protected by intellectual property
                laws. You agree not to reproduce, distribute, modify, or create
                derivative works from any part of our services without our
                explicit consent.
              </p>
            </div>
            <div>
              <h2>5. Termination</h2>
              <p className="m-2">
                We reserve the right to suspend or terminate your account at our
                discretion, without notice, if you violate these Terms of
                Service.
              </p>
            </div>
            <div>
              <h2>6. Disclaimer of Warranties</h2>
              <p className="m-2">
                The LMS is provided "as is" and "as available" without any
                warranties, express or implied. We do not warrant that the
                services will be error-free or uninterrupted.
              </p>
            </div>
            <div>
              <h2>7. Limitation of Liability</h2>
              <p className="m-2">
                We shall not be liable for any direct, indirect, incidental,
                special, or consequential damages arising out of or in any way
                connected with the use of our services.
              </p>
            </div>
            <div>
              <h2>8. Governing Law</h2>
              <p className="m-2">
                These Terms of Service are governed by and construed in
                accordance with the laws of the Republic of the Union of
                Myanmar.
              </p>
            </div>
            <div>
              <h2>9. Changes to Terms of Service</h2>
              <p className="m-2">
                We may update these Terms of Service to reflect changes in our
                services or for legal reasons. We will only notify you of
                significant changes.
              </p>
              <p className="m-2">
                By using the LMS, you acknowledge that you have read,
                understood, and agree to our Privacy Policy and Terms of
                Service. If you have any questions or concerns, please contact
                us at misterjames.thiha@gmail.com
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Terms;
