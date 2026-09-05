const RescheduleWarningText = () => {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Important: </span>
      Events outside the new start and end dates will be deleted.
    </p>
  );
};

export default RescheduleWarningText;
