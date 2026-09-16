import { formatDate } from "@/helpers/date-server";
import { getTenantOnServer } from "@/helpers/tenant";

const tenant = async () => await getTenantOnServer();

const Privacy = async () => {
  const t = await tenant();
  return (
    <>
      {t.tenant && (
        <>
          <h1 className=" text-5xl">Privacy Policy</h1>
          <div className="space-y-3">
          <p>Effective date: {formatDate(new Date(2024, 0, 1))}</p>
            <div>
              <h2>1. Introduction</h2>
              <p className="m-2">
                Welcome to {t.tenant.name}'s cloud-based school management
                software-as-a-service. This Privacy Policy explains how we
                collect, use, disclose, and protect your personal information
                when you use our website and services. From here onwards, we
                will refer to our website and services as "the LMS".
              </p>
            </div>

            <div>
              <h2>2. Information We Collect</h2>
              <div className="m-2">
                <h3>2.1 Account Information</h3>
                <p className="m-2">
                  When you create an account on the LMS, we collect personal
                  information such as your name, email address, and password.
                  Teachers, school admins, and students will receive accounts
                  with specific roles and permissions.
                </p>
                <h3>2.2 Scheduling and Academic Data</h3>
                <p className="m-2">
                  We collect information related to course schedules,
                  assignments, attendance records, quiz results, and academic
                  reports. This information is essential for the proper
                  functioning of our service and to provide a comprehensive
                  school management experience.
                </p>
                <h3>2.3 Communication</h3>
                <p className="m-2">
                  We may collect information about your communication with us,
                  including support requests and feedback.
                </p>
              </div>
            </div>

            <div>
              <h2>3. How We Use Your Information</h2>
              <div className="m-2">
                <h3>3.1 Providing and Improving Services</h3>
                <p className="m-2">
                  We use your information to provide, maintain, and improve our
                  services. We may also use your information to understand how
                  our services are being used and to develop new features.
                </p>
                <h3>3.2 Communication</h3>
                <p className="m-2">
                  We may use your information to communicate with you about our
                  services, including important updates and notifications.
                </p>
                <h3>Analytics</h3>
                <p className="m-2">
                  We may use your information to monitor and analyze trends and
                  usage of our services.
                </p>
              </div>
            </div>
            <div>
              <h2>4. How We Share Your Information</h2>
              <div className="m-2">
                <h3>4.1 Third-Party Service Providers</h3>
                <p className="m-2">
                  We may share your information with third-party service
                  providers who help us provide our services. These third-party
                  service providers will be authorized to use your information
                  only as necessary to provide services to us.
                </p>
                <h3>4.2 Legal Compliance</h3>
                <p className="m-2">
                  We may share your information to comply with applicable laws,
                  regulations, legal processes, or government requests.
                </p>
              </div>
            </div>
            <div>
              <h2>5. Security</h2>
              <p className="m-2">
                We take reasonable measures to protect your personal information
                from unauthorized access, disclosure, alteration, and
                destruction. However, no data transmission over the internet or
                electronic storage is completely secure, and we cannot guarantee
                absolute security.
              </p>
            </div>
            <div>
              <h2>6. Your Choices</h2>
              <p className="m-2">
                You can access, update, or delete your account information by
                logging into your Schedjuice account. You may also contact us to
                exercise your rights regarding your personal information.
              </p>
            </div>
            <div>
              <h2>7. Changes to this Privacy Policy</h2>
              <p className="m-2">
                We may update this Privacy Policy from time to time.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Privacy;
