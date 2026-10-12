import type { RouteObject } from 'react-router'
import { RouteErrorView } from '@/components/ErrorPages'
import { AuthRoot, RequireAuth } from '@/features/auth/AuthRoot'
import { AccountPage } from '@/pages/account'
import { SessionGate, SessionIndexRedirect } from '@/features/sessions/SessionGate'
import { CvDetailPage } from '@/pages/cv-detail'
import { DevComponentsPage } from '@/pages/dev-components'
import { HomePage } from '@/pages/home'
import { InterviewPage } from '@/pages/interview'
import { JdDetailPage } from '@/pages/jd-detail'
import { LibraryPage } from '@/pages/library'
import { LoginPage, SignupPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { ReviewPage } from '@/pages/review'
import { SessionMatchPage } from '@/pages/session-match'
import { SessionNewPage } from '@/pages/session-new'
import { SessionPlanPage } from '@/pages/session-plan'
import { BlankLayout } from './layouts/BlankLayout'
import { FullscreenLayout } from './layouts/FullscreenLayout'
import { SidebarLayout } from './layouts/SidebarLayout'

// Page numbers [n] follow docs/design/ui-pages.md §1.
export const routes: RouteObject[] = [
  {
    element: <AuthRoot />,
    errorElement: <RouteErrorView />,
    children: [
      {
        // Everything but the login pages needs a logged-in user (when login is on).
        element: <RequireAuth />,
        children: [
          {
            element: <SidebarLayout />,
            children: [
              {
                // Pathless so a render error keeps the sidebar.
                errorElement: <RouteErrorView />,
                children: [
                  { path: '/', element: <HomePage /> }, // [1]
                  { path: '/sessions/new', element: <SessionNewPage /> }, // [2]
                  {
                    path: '/sessions/:id',
                    element: <SessionGate />,
                    children: [
                      { index: true, element: <SessionIndexRedirect /> },
                      { path: 'match', element: <SessionMatchPage /> }, // [3]
                      { path: 'plan', element: <SessionPlanPage /> }, // [4]
                      { path: 'review', element: <ReviewPage /> }, // [6]
                    ],
                  },
                  { path: '/library', element: <LibraryPage /> }, // [7]
                  { path: '/library/cv/:id', element: <CvDetailPage /> }, // [8]
                  { path: '/library/jd/:id', element: <JdDetailPage /> }, // [9]
                  { path: '/account', element: <AccountPage /> }, // [10], login on only
                  ...(import.meta.env.DEV
                    ? [{ path: '/dev/components', element: <DevComponentsPage /> }]
                    : []),
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
          {
            element: <FullscreenLayout />,
            errorElement: <RouteErrorView />,
            children: [
              {
                path: '/sessions/:id/interview',
                element: <SessionGate />,
                children: [{ index: true, element: <InterviewPage /> }], // [5]
              },
            ],
          },
        ],
      },
      {
        element: <BlankLayout />,
        children: [
          { path: '/login', element: <LoginPage /> }, // [11]
          { path: '/signup', element: <SignupPage /> }, // [11]
        ],
      },
    ],
  },
]
