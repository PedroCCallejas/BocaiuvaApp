# Firebase rules draft for public teams

This project now has a public-team gallery and a public team profile.
Do not expose the full internal team snapshot.

Suggested direction:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function isPublicTeam(teamData) {
      return teamData.isPublic == true;
    }

    match /teams/{teamId} {
      allow read: if isSignedIn() && isPublicTeam(resource.data);
      allow write: if false; // keep existing admin-only rule here
    }

    match /players/{playerId} {
      allow read: if isSignedIn() &&
        resource.data.teamId != null;
      // tighten this with a public-profile projection strategy.
      // Prefer a dedicated public collection or callable endpoint if rules become too broad.
    }

    match /matches/{matchId} {
      allow read: if isSignedIn() &&
        resource.data.teamId != null;
      // same note: public gallery should read only safe aggregate inputs.
    }
  }
}
```

Important notes:

- The repository methods `listPublicTeams()` and `getPublicTeamProfile()` already return only a public subset.
- Firestore rules still need a safe data-access strategy so authenticated users can read public teams without gaining access to private team internals.
- If direct reads on `players` and `matches` become too permissive, move public data to a dedicated denormalized collection such as `publicTeams` and `publicTeamPlayers`.
