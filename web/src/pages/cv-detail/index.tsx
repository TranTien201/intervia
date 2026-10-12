import { useParams } from 'react-router'
import { useCv, useCvVersion } from '@/api/hooks'
import { Page } from '@/components/Page'
import { PageSkeleton, QueryView } from '@/components/PageStates'
import { ItemDetail } from '@/features/library/ItemDetail'
import { ProfileEditor } from '@/features/profile/ProfileEditor'

// [8] CV detail: edit the extracted profile, browse its versions, see the sessions that used it.
export function CvDetailPage() {
  const { id = '' } = useParams()
  const cv = useCv(id)
  return (
    <Page>
      <QueryView
        query={cv}
        loading={<PageSkeleton variant="detail" />}
        notFoundMessage="Không tìm thấy CV này. Có thể nó đã bị xóa."
      >
        {(data) => (
          <ItemDetail
            kind="cv"
            item={data}
            info={[
              data.file_name,
              <a
                key="file"
                href={`/api/cvs/${data.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-4 hover:underline"
              >
                Xem file gốc
              </a>,
            ]}
            editorLabel="Hồ sơ"
            renderEditor={(v) => <ProfileVersion cvId={data.id} version={v} />}
          />
        )}
      </QueryView>
    </Page>
  )
}

function ProfileVersion({ cvId, version }: { cvId: string; version: number | 'latest' }) {
  const query = useCvVersion(cvId, version)
  return (
    <QueryView
      query={query}
      loading={<PageSkeleton rows={3} />}
      notFoundMessage={`Không có bản ${version} của CV này.`}
    >
      {(v) => <ProfileEditor cvId={cvId} version={v} readOnly={version !== 'latest'} />}
    </QueryView>
  )
}
