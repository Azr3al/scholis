const meetingLinkMapper = {
  googleMeet: {
    icon: "/svg-icons/google-meet.svg",
    regx: /https:\/\/meet\.google\.com(?:\/[a-zA-Z0-9-]+)?/i,
  },
  zoom: {
    icon: "/svg-icons/zoom.svg",
    regx: /https:\/\/(?:[\w-]+\.)?zoom\.us(?:\/j\/\d+(?:\?pwd=[\w\d]+)?)?/i,
  },
  microsoftTeam: {
    icon: "/svg-icons/microsoft-teams.svg",
    regx: /https:\/\/teams\.(?:microsoft|live)\.com(?:\/(?:l\/meetup-join|meet)\/[a-zA-Z0-9?=&._-]+)?/i,
  },
};

export const isGoogleMeetLink = (link: string): boolean =>
  meetingLinkMapper.googleMeet.regx.test(link);

export const isTeamsMeeting = (link: string): boolean =>
  meetingLinkMapper.microsoftTeam.regx.test(link);

export const isZoomMeeting = (link: string): boolean =>
  meetingLinkMapper.zoom.regx.test(link);

export const discriminateMeetingLink = (toDiscriminateLink: string): string => {
  let result = "/svg-icons/unknown.svg";
  Object.entries(meetingLinkMapper).map(([key, value]) => {
    if (value.regx.test(toDiscriminateLink)) {
      result = value.icon;
    }
  });
  return result;
};

const PLATFORM_ICONS: Record<string, string> = {
  ZOOM: meetingLinkMapper.zoom.icon,
  MEET: meetingLinkMapper.googleMeet.icon,
};

export function meetingPlatformIcon(
  link: string | null | undefined,
  platform?: string | null,
): string | null {
  const trimmed = link?.trim() ?? "";
  if (trimmed) {
    const fromLink = discriminateMeetingLink(trimmed);
    if (fromLink !== "/svg-icons/unknown.svg") {
      return fromLink;
    }
  }
  if (platform && PLATFORM_ICONS[platform]) {
    return PLATFORM_ICONS[platform];
  }
  return null;
}
