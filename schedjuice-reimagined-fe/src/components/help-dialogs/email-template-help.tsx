"use client"

import HelpDialog from "../misc/help-dialog"

const EmailTemplateHelpDialog = () => {
return (
    <HelpDialog
    title="Email Template"
    content={
      <div className="space-y-2">
        <p>
          Upload a CSV file containing at least one column named 'email'.
          These are the primary email addresses of the students of this
          course. The CSV file can contain other columns as well, which
          can be used as variables in the email template.
        </p>
        <p>
          In the email template, you can use variables in the format of
          $variable_name. These variables will be replaced with the
          corresponding values from the CSV file.
        </p>
        <p>
          Example: If the CSV file contains a column named 'name', you can
          use $name in the email template.
        </p>
        <p>
          Template email:
          <br />
          Hello $name, your email is $email.
        </p>
        <p>
          Resulting email:
          <br />
          Hello John, your email is john@example.com.
        </p>
      </div>
    }
  ></HelpDialog>
)
}

export default EmailTemplateHelpDialog;