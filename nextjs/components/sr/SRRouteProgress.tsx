'use client'
import type { RouteStep } from '@/types'

export default function SRRouteProgress({ steps, currentStep }: {
  steps: RouteStep[]; currentStep: number
}) {
  return (
    <div className="card">
      <h3 style={{ marginBottom:'16px' }}>Route Progress</h3>
      <div style={{ overflowX:'auto', paddingBottom:'4px' }}>
        <div style={{ display:'flex', alignItems:'center', minWidth:'max-content' }}>
          {steps.map((step, i) => {
            const done = i < currentStep
            const current = i === currentStep
            return (
              <div key={step.id} style={{ display:'flex', alignItems:'center' }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
                  <div className={`route-step-dot ${done ? 'done' : current ? 'current' : ''}`}>
                    {done ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : step.step_order}
                  </div>
                  <div style={{
                    fontSize:'0.65rem', fontWeight: current ? 600 : 400,
                    color: done ? 'var(--accent)' : current ? 'var(--text-primary)' : 'var(--text-muted)',
                    textAlign:'center', maxWidth:'70px', lineHeight:1.3,
                  }}>
                    {step.name}
                  </div>
                  {step.sla_hours && (
                    <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', marginTop:'-4px' }}>
                      SLA {step.sla_hours}h
                    </div>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div className={`route-connector ${done ? 'done' : ''}`} style={{ width:'40px', margin:'0 4px', marginBottom:'28px' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ marginTop:'12px', fontSize:'0.78rem', color:'var(--text-secondary)' }}>
        Step {currentStep} of {steps.length} · {steps[currentStep]?.name ?? 'Complete'}
        {steps[currentStep]?.assigned_role && (
          <span style={{ marginLeft:'8px', color:'var(--text-muted)' }}>
            (Assigned to: {steps[currentStep].assigned_role})
          </span>
        )}
      </div>
    </div>
  )
}
