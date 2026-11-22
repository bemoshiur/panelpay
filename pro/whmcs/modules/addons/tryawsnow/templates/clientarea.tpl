<div class="card">
  <div class="card-body">
    <h3 class="card-title">TryAWS.now Panel</h3>
    {if $openPanelUrl}
      <p><a class="btn btn-primary" href="{$openPanelUrl|escape:'html'}" target="_blank" rel="noopener">Open panel</a></p>
    {else}
      <p class="text-muted">The panel is not set up yet. Please contact support.</p>
    {/if}
    <hr>
    <h4>Top up wallet</h4>
    {if $error eq 'invalid_amount'}
      <div class="alert alert-danger">Enter an amount from {$minTopup|escape:'html'} to {$maxTopup|escape:'html'} {$currency|escape:'html'}.</div>
    {elseif $error eq 'invoice_failed'}
      <div class="alert alert-danger">The invoice could not be created. Please contact support.</div>
    {/if}
    <form method="post" action="index.php?m=tryawsnow">
      <input type="hidden" name="token" value="{$token}">
      <div class="input-group" style="max-width:320px">
        <span class="input-group-text">{$currency|escape:'html'}</span>
        <input type="text" class="form-control" name="topup_amount" inputmode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required>
        <button type="submit" class="btn btn-success">Create invoice</button>
      </div>
      <small class="text-muted">The panel wallet is credited once the invoice is paid.</small>
    </form>
  </div>
</div>
