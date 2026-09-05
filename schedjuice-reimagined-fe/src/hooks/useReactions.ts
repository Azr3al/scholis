import { useState, useEffect, useCallback } from "react";
import { useUser } from "./useUser";

export interface ReactionUser {
  id: number;
  name: string;
  avatar: string;
}

export interface Reaction {
  emoji: string;
  users: ReactionUser[];
}

export const useReactions = (announcementId: string) => {
  const { user } = useUser();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch reactions (matching query pattern from #file:calendar/index.tsx)
  useEffect(() => {
    const fetchReactions = async () => {
      setLoading(true);
      try {
        // TODO: Replace with actual API call
        // const { data } = await makeGetRequest(`announcements/${announcementId}/reactions`);
        // setReactions(data);
        
        // Mock data 
        await new Promise((resolve) => setTimeout(resolve, 300));
        setReactions([]);
      } catch (error) {
        console.error("Failed to fetch reactions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReactions();
  }, [announcementId]);

  const toggleReaction = useCallback((emoji: string) => {
    if (!user?.id) return;

    setReactions((prev) => {
      const newReactions = [...prev];
      const reactionIndex = newReactions.findIndex((r) => r.emoji === emoji);
      
      const userData = {
        id: user.id,
        name: user.name,
        avatar: user.profile_image || "/images/default.jpg",
      };

      if (reactionIndex === -1) {
        // Add new reaction type
        newReactions.push({ emoji, users: [userData] });
      } else {
        const userIndex = newReactions[reactionIndex].users.findIndex(
          (u) => u.id === user.id
        );

        if (userIndex === -1) {
          newReactions[reactionIndex].users.push(userData);
        } else {
          newReactions[reactionIndex].users.splice(userIndex, 1);
          
          if (newReactions[reactionIndex].users.length === 0) {
            newReactions.splice(reactionIndex, 1);
          }
        }
      }

      // TODO: Make API call
      // makePostRequest(`announcements/${announcementId}/reactions`, {
      //   emoji,
      //   action: userIndex === -1 ? 'add' : 'remove'
      // });

      return newReactions;
    });
  }, [user, announcementId]);

  const getUserReaction = useCallback((): string | null => {
    if (!user?.id) return null;
    
    const userReaction = reactions.find((reaction) =>
      reaction.users.some((u) => u.id === user.id)
    );
    
    return userReaction?.emoji || null;
  }, [reactions, user]);

  const totalReactions = reactions.reduce(
    (sum, r) => sum + r.users.length,
    0
  );

  return {
    reactions,
    loading,
    toggleReaction,
    getUserReaction,
    totalReactions,
  };
};
