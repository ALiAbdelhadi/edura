# API Endpoints Summary

## 0 — Preflight

### Health check
**Method:** GET
**URL:** {{baseUrl}}/_ping

---

## 1 — Center onboarding → Teacher → Course → Enrollment

### 1.1 Register center (admin1)
**Method:** POST
**URL:** {{baseUrl}}/auth/register/center
**Body:**
```json
{
  "centerName": "Bright Minds Center",
  "adminName": "Admin One",
  "email": "admin1-{{runId}}@test.edu",
  "password": "Password123",
  "phone": "+201000000001",
  "address": "Nasr City, Cairo",
  "location": {
    "type": "Point",
    "coordinates": [
      31.35,
      30.05
    ]
  }
}
```

---

### 1.1b NEGATIVE: duplicate email on register
**Method:** POST
**URL:** {{baseUrl}}/auth/register/center
**Body:**
```json
{
  "centerName": "Duplicate Center",
  "adminName": "Another",
  "email": "admin1-{{runId}}@test.edu",
  "password": "Password123"
}
```

---

### 1.2 Login as admin1 → capture cookie
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{admin1Email}}",
  "password": "Password123"
}
```

---

### 1.2b NEGATIVE: login with wrong password
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{admin1Email}}",
  "password": "WrongPass123"
}
```

---

### 1.3 GET /centers/me
**Method:** GET
**URL:** {{baseUrl}}/centers/me

---

### 1.4 Create room
**Method:** POST
**URL:** {{baseUrl}}/rooms
**Body:**
```json
{
  "name": "Room A",
  "capacity": 20
}
```

---

### 1.4b NEGATIVE: create room without name
**Method:** POST
**URL:** {{baseUrl}}/rooms
**Body:**
```json
{
  "capacity": 20
}
```

---

### 1.5 Invite teacher1 (shell)
**Method:** POST
**URL:** {{baseUrl}}/roster/teachers/invite
**Body:**
```json
{
  "email": "teacher1-{{runId}}@test.edu",
  "name": "Teacher One",
  "createShell": true
}
```

---

### 1.6 Accept teacher invite (set password)
**Method:** POST
**URL:** {{baseUrl}}/auth/invite/accept
**Body:**
```json
{
  "token": "{{teacher1InviteToken}}",
  "password": "TeacherPass123"
}
```

---

### 1.6b NEGATIVE: reuse invite token
**Method:** POST
**URL:** {{baseUrl}}/auth/invite/accept
**Body:**
```json
{
  "token": "{{teacher1InviteToken}}",
  "password": "Another123"
}
```

---

### 1.7 Login as teacher1
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{teacher1Email}}",
  "password": "TeacherPass123"
}
```

---

### 1.8 Teacher sees pending affiliation
**Method:** GET
**URL:** {{baseUrl}}/me/affiliations

---

### 1.9 Teacher accepts affiliation
**Method:** POST
**URL:** {{baseUrl}}/affiliations/{{teacher1AffiliationId}}/accept

---

### 1.10 Admin creates course
**Method:** POST
**URL:** {{baseUrl}}/courses
**Body:**
```json
{
  "teacherId": "{{teacher1UserId}}",
  "defaultRoomId": "{{roomId}}",
  "title": "Physics \u2014 Grade 12",
  "subject": "Physics",
  "gradeTag": "Grade 12 Science",
  "description": "Mechanics and waves",
  "schedulePattern": {
    "daysOfWeek": [
      1,
      3
    ],
    "startTime": "16:00",
    "endTime": "18:00",
    "startDate": "2026-05-01",
    "endDate": "2026-05-31"
  },
  "price": 50000,
  "maxStudents": 2
}
```

---

### 1.10b NEGATIVE: conflicting course → 409
**Method:** POST
**URL:** {{baseUrl}}/courses
**Body:**
```json
{
  "teacherId": "{{teacher1UserId}}",
  "defaultRoomId": "{{roomId}}",
  "title": "Conflicting Course",
  "subject": "Math",
  "schedulePattern": {
    "daysOfWeek": [
      1,
      3
    ],
    "startTime": "17:00",
    "endTime": "19:00",
    "startDate": "2026-05-01",
    "endDate": "2026-05-10"
  },
  "price": 30000,
  "maxStudents": 10
}
```

---

### 1.11 List course sessions
**Method:** GET
**URL:** {{baseUrl}}/sessions?courseId={{$var:courseId}}&limit=20

---

### 1.12 Register student1
**Method:** POST
**URL:** {{baseUrl}}/auth/register/student
**Body:**
```json
{
  "name": "Student One",
  "email": "student1-{{runId}}@test.edu",
  "password": "StudentPass123"
}
```

---

### 1.13 Admin lookup student1 by email
**Method:** POST
**URL:** {{baseUrl}}/roster/students/lookup
**Body:**
```json
{
  "email": "{{student1Email}}"
}
```

---

### 1.13b NEGATIVE: lookup unknown email → 404
**Method:** POST
**URL:** {{baseUrl}}/roster/students/lookup
**Body:**
```json
{
  "email": "ghost-{{runId}}@nowhere.test"
}
```

---

### 1.14 Admin adds student1 to roster
**Method:** POST
**URL:** {{baseUrl}}/roster/students
**Body:**
```json
{
  "studentId": "{{student1UserId}}"
}
```

---

### 1.15 Admin enrolls student1 directly
**Method:** POST
**URL:** {{baseUrl}}/enrollments
**Body:**
```json
{
  "studentId": "{{student1UserId}}",
  "courseId": "{{courseId}}"
}
```

---

### 1.15b NEGATIVE: duplicate enrollment → 409
**Method:** POST
**URL:** {{baseUrl}}/enrollments
**Body:**
```json
{
  "studentId": "{{student1UserId}}",
  "courseId": "{{courseId}}"
}
```

---

### 1.16 Student1 login
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{student1Email}}",
  "password": "StudentPass123"
}
```

---

### 1.17 Student1 sees their sessions
**Method:** GET
**URL:** {{baseUrl}}/sessions?studentId=me&limit=20

---

## 2 — Student + Parent link + Enrollment request + Review

### 2.1 Register student2
**Method:** POST
**URL:** {{baseUrl}}/auth/register/student
**Body:**
```json
{
  "name": "Student Two",
  "email": "student2-{{runId}}@test.edu",
  "password": "StudentPass123"
}
```

---

### 2.2 Register parent1
**Method:** POST
**URL:** {{baseUrl}}/auth/register/parent
**Body:**
```json
{
  "name": "Parent One",
  "email": "parent1-{{runId}}@test.edu",
  "password": "ParentPass123"
}
```

---

### 2.3 Login student2
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{student2Email}}",
  "password": "StudentPass123"
}
```

---

### 2.4 Student2 gets family code
**Method:** GET
**URL:** {{baseUrl}}/me/family-code

---

### 2.5 Login parent1
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{parent1Email}}",
  "password": "ParentPass123"
}
```

---

### 2.6 Parent links via family code (instant)
**Method:** POST
**URL:** {{baseUrl}}/parent-links
**Body:**
```json
{
  "code": "{{student2FamilyCode}}"
}
```

---

### 2.7 Parent GET /me/children
**Method:** GET
**URL:** {{baseUrl}}/me/children

---

### 2.8 NEGATIVE: second link attempt while active
**Method:** POST
**URL:** {{baseUrl}}/parent-links
**Body:**
```json
{
  "code": "{{student2FamilyCode}}"
}
```

---

### 2.9 Admin adds student2 to roster (prep)
**Method:** POST
**URL:** {{baseUrl}}/roster/students
**Body:**
```json
{
  "studentId": "{{student2UserId}}"
}
```

---

### 2.10 Student2 submits enrollment request
**Method:** POST
**URL:** {{baseUrl}}/enrollment-requests
**Body:**
```json
{
  "courseId": "{{courseId}}"
}
```

---

### 2.11 NEGATIVE: duplicate enrollment request
**Method:** POST
**URL:** {{baseUrl}}/enrollment-requests
**Body:**
```json
{
  "courseId": "{{courseId}}"
}
```

---

### 2.12 Admin approves request
**Method:** POST
**URL:** {{baseUrl}}/enrollment-requests/{{enrollmentRequestId}}/approve

---

### 2.13 Admin bulk-marks attendance (present for student2)
**Method:** PUT
**URL:** {{baseUrl}}/sessions/{{session1Id}}/attendance
**Body:**
```json
{
  "records": [
    {
      "studentId": "{{student1UserId}}",
      "status": "present"
    },
    {
      "studentId": "{{student2UserId}}",
      "status": "present"
    }
  ]
}
```

---

### 2.14 Student2 submits review (eligible after 1 present)
**Method:** POST
**URL:** {{baseUrl}}/reviews
**Body:**
```json
{
  "teacherId": "{{teacher1UserId}}",
  "courseId": "{{courseId}}",
  "centerId": "{{centerId}}",
  "rating": 5,
  "text": "Excellent teacher, clear explanations."
}
```

---

### 2.15 NEGATIVE: duplicate review for same teacher
**Method:** POST
**URL:** {{baseUrl}}/reviews
**Body:**
```json
{
  "teacherId": "{{teacher1UserId}}",
  "courseId": "{{courseId}}",
  "centerId": "{{centerId}}",
  "rating": 4,
  "text": "Another review"
}
```

---

### 2.16 NEGATIVE: rating out of range
**Method:** PATCH
**URL:** {{baseUrl}}/reviews/{{reviewId}}
**Body:**
```json
{
  "rating": 7
}
```

---

### 2.17 NEGATIVE: review eligibility — register student with no attendance
**Method:** POST
**URL:** {{baseUrl}}/auth/register/student
**Body:**
```json
{
  "name": "No Attendance Student",
  "email": "noattend-{{runId}}@test.edu",
  "password": "Password123"
}
```

---

### 2.18 Login noAttend
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{noAttendEmail}}",
  "password": "Password123"
}
```

---

### 2.19 NEGATIVE: review without any attendance → 403
**Method:** POST
**URL:** {{baseUrl}}/reviews
**Body:**
```json
{
  "teacherId": "{{teacher1UserId}}",
  "courseId": "{{courseId}}",
  "centerId": "{{centerId}}",
  "rating": 5,
  "text": "Should be blocked"
}
```

---

## 3 — Session cancel/postpone + conflict detection

### 3.1 Admin invites teacher2 (shell)
**Method:** POST
**URL:** {{baseUrl}}/roster/teachers/invite
**Body:**
```json
{
  "email": "teacher2-{{runId}}@test.edu",
  "name": "Teacher Two",
  "createShell": true
}
```

---

### 3.2 Teacher2 activates + logs in
**Method:** POST
**URL:** {{baseUrl}}/auth/invite/accept
**Body:**
```json
{
  "token": "{{teacher2InviteToken}}",
  "password": "TeacherPass123"
}
```

---

### 3.3 Login teacher2
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{teacher2Email}}",
  "password": "TeacherPass123"
}
```

---

### 3.4 NEGATIVE: teacher2 (not assigned) tries to cancel session1 → 403
**Method:** POST
**URL:** {{baseUrl}}/sessions/{{session1Id}}/cancel
**Body:**
```json
{
  "reason": "Not mine, shouldn't work"
}
```

---

### 3.5 NEGATIVE: teacher1 cancels without reason → 422
**Method:** POST
**URL:** {{baseUrl}}/sessions/{{session1Id}}/cancel
**Body:**
```json
{}
```

---

### 3.6 Teacher1 cancels session1 with reason
**Method:** POST
**URL:** {{baseUrl}}/sessions/{{session1Id}}/cancel
**Body:**
```json
{
  "reason": "Teacher sick"
}
```

---

### 3.7 Teacher1 postpones session2 to a non-conflicting slot
**Method:** POST
**URL:** {{baseUrl}}/sessions/{{session2Id}}/postpone
**Body:**
```json
{
  "newDate": "2026-06-15",
  "newStartTime": "10:00",
  "newEndTime": "12:00",
  "reason": "Schedule conflict, moving to Sunday morning"
}
```

---

### 3.8 NEGATIVE: postpone session3 into session2's new slot → 409
**Method:** POST
**URL:** {{baseUrl}}/sessions/{{session3Id}}/postpone
**Body:**
```json
{
  "newDate": "2026-06-15",
  "newStartTime": "11:00",
  "newEndTime": "13:00",
  "reason": "Try to overlap"
}
```

---

### 3.9 Verify session3 unchanged after failed postpone
**Method:** GET
**URL:** {{baseUrl}}/sessions/{{session3Id}}

---

## 4 — Blacklist + enrollment request rejection

### 4.1 Register student3
**Method:** POST
**URL:** {{baseUrl}}/auth/register/student
**Body:**
```json
{
  "name": "Student Three",
  "email": "student3-{{runId}}@test.edu",
  "password": "StudentPass123"
}
```

---

### 4.2 Admin adds student3 to roster
**Method:** POST
**URL:** {{baseUrl}}/roster/students
**Body:**
```json
{
  "studentId": "{{student3UserId}}"
}
```

---

### 4.3 Admin blacklists student3
**Method:** PATCH
**URL:** {{baseUrl}}/roster/students/{{student3UserId}}
**Body:**
```json
{
  "blacklisted": true,
  "blacklistReason": "Disruptive behavior"
}
```

---

### 4.4 Login student3
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{student3Email}}",
  "password": "StudentPass123"
}
```

---

### 4.5 NEGATIVE: blacklisted student submits request → 403
**Method:** POST
**URL:** {{baseUrl}}/enrollment-requests
**Body:**
```json
{
  "courseId": "{{courseId}}"
}
```

---

### 4.6 NEGATIVE: admin tries to direct-enroll blacklisted student → 422
**Method:** POST
**URL:** {{baseUrl}}/enrollments
**Body:**
```json
{
  "studentId": "{{student3UserId}}",
  "courseId": "{{courseId}}"
}
```

---

### 4.7 Admin un-blacklists
**Method:** PATCH
**URL:** {{baseUrl}}/roster/students/{{student3UserId}}
**Body:**
```json
{
  "blacklisted": false
}
```

---

### 4.8 Student3 can now submit request
**Method:** POST
**URL:** {{baseUrl}}/enrollment-requests
**Body:**
```json
{
  "courseId": "{{courseId}}"
}
```

---

### 4.9 Admin declines with reason
**Method:** POST
**URL:** {{baseUrl}}/enrollment-requests/{{enrollmentRequestId}}/decline
**Body:**
```json
{
  "reason": "Course full, please try next term"
}
```

---

## 5 — Shell activation (student pre-created)

### 5.1 Admin pre-creates shell student
**Method:** POST
**URL:** {{baseUrl}}/roster/students/invite
**Body:**
```json
{
  "email": "shell-{{runId}}@test.edu",
  "name": "Shell Student"
}
```

---

### 5.2 NEGATIVE: invite same email twice → 409
**Method:** POST
**URL:** {{baseUrl}}/roster/students/invite
**Body:**
```json
{
  "email": "shell-{{runId}}@test.edu",
  "name": "Duplicate"
}
```

---

### 5.3 Verify shell appears in roster with status=shell
**Method:** GET
**URL:** {{baseUrl}}/roster/students

---

### 5.4 Shell student activates with invite token
**Method:** POST
**URL:** {{baseUrl}}/auth/invite/accept
**Body:**
```json
{
  "token": "{{shellStudentInviteToken}}",
  "password": "ShellPass123"
}
```

---

### 5.5 NEGATIVE: invalid invite token → 400/410
**Method:** POST
**URL:** {{baseUrl}}/auth/invite/accept
**Body:**
```json
{
  "token": "definitely-not-a-real-token",
  "password": "Whatever123"
}
```

---

### 5.6 Former shell logs in
**Method:** POST
**URL:** {{baseUrl}}/auth/login
**Body:**
```json
{
  "email": "{{shellStudentEmail}}",
  "password": "ShellPass123"
}
```

---

### 5.7 Former shell GET /me → role=student, status=active
**Method:** GET
**URL:** {{baseUrl}}/me

---

### 5.8 Verify roster membership preserved after activation
**Method:** GET
**URL:** {{baseUrl}}/roster/students

---

